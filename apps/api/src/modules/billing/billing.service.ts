import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, InvoiceStatus, Metal, Purity, BillType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PricingService, PriceLineInput, InvoiceCalculation } from './pricing.service';
import { IrnService } from './irn.service';
import { PdfService } from './pdf.service';
import { demoRatesAllowed, rateMaxAgeHours, rateUsability } from '../rate-sync/rate-math';
import {
  CreateInvoiceDto,
  InvoiceLineDto,
  RecordPaymentDto,
  PreviewInvoiceDto,
  CreateCustomerDto,
} from './dto/create-invoice.dto';

const ZERO = new Prisma.Decimal(0);

// ---------------------------------------------------------------------------
// Purity → Metal mapping
// ---------------------------------------------------------------------------
function metalFromPurity(purity: Purity): Metal {
  if (
    purity === Purity.GOLD_24K ||
    purity === Purity.GOLD_22K ||
    purity === Purity.GOLD_18K ||
    purity === Purity.GOLD_14K
  ) {
    return Metal.GOLD;
  }
  if (purity === Purity.SILVER_999 || purity === Purity.SILVER_925) {
    return Metal.SILVER;
  }
  return Metal.PLATINUM;
}

// ---------------------------------------------------------------------------
// Invoice number generation helper
// ---------------------------------------------------------------------------
function yyyymm(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

// ---------------------------------------------------------------------------
// Rate cache value shape
// ---------------------------------------------------------------------------
interface RateCacheEntry {
  ratePerGram: string | number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// List invoices query shape
// ---------------------------------------------------------------------------
export interface ListInvoicesQuery {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: InvoiceStatus;
  search?: string;
  from?: string | Date;
  to?: string | Date;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly pricing: PricingService,
    private readonly irn: IrnService,
    private readonly pdf: PdfService,
  ) {}

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Legacy placeholder record that older invoices were billed to. Every new bill must name a
   * real customer, so it can't be selected any more.
   */
  private static readonly LEGACY_WALK_IN_PHONE = '0000000000';

  /**
   * Fetch rate from Redis for a given purity. Refuses to bill on a missing, stale or demo rate
   * (demo rates are allowed only outside production) so invoices never use a wrong price.
   */
  private async fetchRate(metal: Metal, purity: Purity): Promise<Prisma.Decimal> {
    const key = `rate:${metal}:${purity}`;
    const cached = await this.redis.getJson<RateCacheEntry>(key);
    const check = rateUsability(
      cached
        ? { ratePerGram: Number(cached.ratePerGram), snappedAt: cached.snappedAt as string | undefined, source: cached.source as string | undefined }
        : null,
      { now: new Date(), allowDemo: demoRatesAllowed(), maxAgeHours: rateMaxAgeHours(), label: purity.replace('_', ' ') },
    );
    if (!check.ok) throw new BadRequestException(check.message);
    return new Prisma.Decimal(String(cached!.ratePerGram));
  }

  /** Generate the next invoice number for the current month. */
  /** Tax invoices (SVR-) and estimates (EST-) have separate, gap-free series. */
  private async nextInvoiceNumber(series: 'SVR' | 'EST' = 'SVR'): Promise<string> {
    const prefix = series + '-' + yyyymm(new Date());
    const last = await this.prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let seq = 1;
    if (last) {
      // Format: SVR-YYYYMM-NNNN  → last 4 chars are the sequence
      const parts = last.invoiceNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Resolve every bill line to a priced input. Inventory lines take weight/making/stone from the
   * item; manual lines carry their own description, purity, weight and making. Rates come from
   * the live rate cache (guarded), unless the counter typed a rate for the line (any line).
   * Returns: priceLineInputs (same order as `lines`), itemMap, and the live rates used.
   */
  private async resolveLines(lines: InvoiceLineDto[]): Promise<{
    priceLineInputs: PriceLineInput[];
    itemMap: Map<string, Awaited<ReturnType<typeof this.prisma.item.findUniqueOrThrow>>>;
    rateMap: Map<Purity, Prisma.Decimal>;
  }> {
    if (!lines.length) throw new BadRequestException('Add at least one item to the bill.');

    const itemIds = lines.filter((l) => l.itemId).map((l) => l.itemId!);
    const items = itemIds.length
      ? await this.prisma.item.findMany({ where: { id: { in: itemIds }, active: true } })
      : [];
    const itemMap = new Map(items.map((i) => [i.id, i]));

    lines.forEach((l, idx) => {
      const n = idx + 1;
      if (l.itemId) {
        if (!itemMap.has(l.itemId)) throw new NotFoundException(`Item ${l.itemId} not found or inactive.`);
        return;
      }
      if (!l.description?.trim()) throw new BadRequestException(`Line ${n}: enter the item name.`);
      if (!l.purity) throw new BadRequestException(`Line ${n} (${l.description}): choose the metal/purity.`);
      if (!(Number(l.netWeightG) > 0)) throw new BadRequestException(`Line ${n} (${l.description}): enter the net weight.`);
      if ((l.makingPct ?? 0) > 0 && (l.makingPerGram ?? 0) > 0) {
        throw new BadRequestException(`Line ${n} (${l.description}): give making as a % or per gram, not both.`);
      }
    });

    // Live rates are needed only for lines without a rate typed at the counter
    const neededPurities = new Set<Purity>();
    for (const l of lines) {
      if (l.ratePerGram != null) continue;
      neededPurities.add(l.itemId ? itemMap.get(l.itemId)!.purity : l.purity!);
    }
    const rateMap = new Map<Purity, Prisma.Decimal>();
    await Promise.all(
      [...neededPurities].map(async (purity) => {
        rateMap.set(purity, await this.fetchRate(metalFromPurity(purity), purity));
      }),
    );

    const dec = (n: number | undefined) => new Prisma.Decimal(String(n ?? 0));
    const priceLineInputs: PriceLineInput[] = lines.map((l) => {
      if (l.itemId) {
        const item = itemMap.get(l.itemId)!;
        return {
          itemId: item.id,
          purity: item.purity,
          qty: l.qty,
          netWeightG: l.netWeightG !== undefined ? new Prisma.Decimal(String(l.netWeightG)) : item.netWeightG,
          ratePerGram: l.ratePerGram != null ? new Prisma.Decimal(String(l.ratePerGram)) : rateMap.get(item.purity)!,
          makingPct: item.makingPct,
          makingPerGram: item.makingPerGram,
          stoneValue: item.stoneValue,
        };
      }
      return {
        itemId: null,
        description: l.description!.trim(),
        purity: l.purity!,
        qty: l.qty,
        netWeightG: new Prisma.Decimal(String(l.netWeightG)),
        ratePerGram: l.ratePerGram != null ? new Prisma.Decimal(String(l.ratePerGram)) : rateMap.get(l.purity!)!,
        makingPct: dec(l.makingPct),
        makingPerGram: dec(l.makingPerGram),
        stoneValue: dec(l.stoneValue),
      };
    });

    return { priceLineInputs, itemMap, rateMap };
  }

  // -------------------------------------------------------------------------
  // 1. createInvoice
  // -------------------------------------------------------------------------
  async createInvoice(dto: CreateInvoiceDto, userId: string) {
    const isEstimate = dto.billType === BillType.ESTIMATE;
    const { priceLineInputs } = await this.resolveLines(dto.lines);

    const oldGoldWeightG = new Prisma.Decimal(String(dto.oldGoldWeightG ?? 0));
    const oldGoldRatePerGram = new Prisma.Decimal(String(dto.oldGoldRatePerGram ?? 0));
    const isInterstate = dto.isInterstate ?? false;

    const calc = this.pricing.computeInvoice(
      priceLineInputs,
      oldGoldWeightG,
      oldGoldRatePerGram,
      isInterstate,
      !isEstimate,
    );

    // Paying at the counter: never more than the bill (GST and non-GST bills alike)
    if (dto.paymentMode && dto.paymentAmount != null && new Prisma.Decimal(String(dto.paymentAmount)).greaterThan(calc.totalAmount)) {
      throw new BadRequestException(`Amount paid can't be more than the bill total (₹${calc.totalAmount.toFixed(2)}).`);
    }

    // Separate number series so the tax-invoice sequence stays continuous
    const invoiceNumber = await this.nextInvoiceNumber(isEstimate ? 'EST' : 'SVR');

    // Every bill is made out to a real customer (no anonymous walk-in bills)
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found. Choose or add the customer for this bill.');
    if (customer.phone === BillingService.LEGACY_WALK_IN_PHONE) {
      throw new BadRequestException('Bills must be made out to a real customer. Find or add the customer by name and phone.');
    }

    // One RateSnapshot per distinct (purity, rate) actually billed. A rate typed at the counter is
    // recorded with source 'manual-bill'. The first line's snapshot is the invoice's primary one.
    const snapshotIds = new Map<string, string>();
    const lineSnapshotKey = priceLineInputs.map((l, idx) => {
      const manualRate = dto.lines[idx].ratePerGram != null;
      return { key: `${l.purity}:${l.ratePerGram.toString()}:${manualRate ? 'manual' : 'live'}`, manualRate, l };
    });
    for (const { key, manualRate, l } of lineSnapshotKey) {
      if (snapshotIds.has(key)) continue;
      const purity = l.purity as Purity;
      const snapshot = await this.prisma.rateSnapshot.create({
        data: {
          metal: metalFromPurity(purity),
          purity,
          ratePerGram: l.ratePerGram,
          source: manualRate ? 'manual-bill' : 'redis-cache',
        },
      });
      snapshotIds.set(key, snapshot.id);
    }
    const primarySnapshotId = snapshotIds.get(lineSnapshotKey[0].key)!;

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          customer: { connect: { id: customer.id } },
          rateSnapshot: { connect: { id: primarySnapshotId } },
          createdBy: { connect: { id: userId } },
          invoiceNumber,
          billType: isEstimate ? BillType.ESTIMATE : BillType.TAX_INVOICE,
          subtotal: calc.subtotal,
          makingTotal: calc.makingTotal,
          wastageTotal: calc.wastageTotal,
          stoneTotal: calc.stoneTotal,
          oldGoldDeduction: calc.oldGoldDeduction,
          oldGoldWeightG,
          oldGoldRatePerGram,
          taxableAmount: calc.taxableAmount,
          cgst: calc.cgst,
          sgst: calc.sgst,
          igst: calc.igst,
          totalAmount: calc.totalAmount,
          amountPaid: ZERO,
          // GST and non-GST (estimate) bills are both sales: the total is owed until paid
          balanceDue: calc.totalAmount,
          status: InvoiceStatus.CONFIRMED,
          notes: dto.notes,
          invoicedAt: new Date(),
          lines: {
            create: calc.lines.map((l) => ({
              ...(l.itemId ? { item: { connect: { id: l.itemId } } } : {}),
              description: l.itemId ? null : l.description ?? null,
              purity: (l.purity as Purity) ?? null,
              qty: l.qty,
              netWeightG: l.netWeightG,
              ratePerGram: l.ratePerGram,
              makingCharge: l.makingCharge,
              wastage: l.wastage,
              stoneValue: l.stoneValue,
              lineTotal: l.lineTotal,
            })),
          },
        },
      });

      if (!isEstimate) {
        // Stock leaves the shop only for inventory lines on a real sale
        for (const lineDto of dto.lines) {
          if (!lineDto.itemId) continue;
          await tx.item.update({
            where: { id: lineDto.itemId },
            data: { stockQty: { decrement: lineDto.qty } },
          });
          await tx.stockMovement.create({
            data: {
              item: { connect: { id: lineDto.itemId } },
              type: 'OUT',
              qty: lineDto.qty,
              reason: 'Sale',
              refId: created.id,
            },
          });
        }

        await tx.registerEntry.create({
          data: {
            createdById: userId,
            refInvoiceId: created.id,
            registerType: 'SALES',
            description: `Invoice ${invoiceNumber}`,
            amount: calc.totalAmount,
          },
        });
      }

      // Payment at the counter — same for GST and non-GST bills; the rest stays due
      if (dto.paymentMode) {
        const paid = new Prisma.Decimal(String(dto.paymentAmount ?? calc.totalAmount));
        if (paid.greaterThan(ZERO)) {
          await tx.payment.create({
            data: { invoice: { connect: { id: created.id } }, amount: paid, mode: dto.paymentMode },
          });
          await tx.invoice.update({
            where: { id: created.id },
            data: { amountPaid: paid, balanceDue: calc.totalAmount.sub(paid).toDecimalPlaces(2) },
          });
        }
      }

      return tx.invoice.findUniqueOrThrow({
        where: { id: created.id },
        include: { customer: true, lines: { include: { item: true } }, payments: true, rateSnapshot: true },
      });
    });

    if (isEstimate) return invoice; // non-GST: not in the GST sales register, no e-invoice

    // Update customer totalSpent (outside transaction — non-critical)
    this.prisma.customer
      .update({
        where: { id: customer.id },
        data: { totalSpent: { increment: calc.totalAmount } },
      })
      .catch((err: Error) => this.logger.warn('Failed to update customer totalSpent: ' + err.message));

    // Trigger IRN registration async — do not await
    this.irn.registerIrn(invoice.id, invoiceNumber).then((result) => {
      this.prisma.invoice
        .update({
          where: { id: invoice.id },
          data: {
            irn: result.irn,
            irnQrUrl: result.signedQrCode,
            status: InvoiceStatus.IRN_REGISTERED,
          },
        })
        .catch((err: Error) => this.logger.error('Failed to persist IRN on invoice: ' + err.message));
    }).catch((err: Error) => {
      this.logger.error('IRN registration failed for invoice ' + invoiceNumber + ': ' + err.message);
      this.prisma.invoice
        .update({ where: { id: invoice.id }, data: { status: InvoiceStatus.IRN_PENDING } })
        .catch(() => undefined);
    });

    return invoice;
  }

  // -------------------------------------------------------------------------
  // 2. previewInvoice
  // -------------------------------------------------------------------------
  async previewInvoice(dto: PreviewInvoiceDto): Promise<InvoiceCalculation> {
    const { priceLineInputs } = await this.resolveLines(dto.lines);

    const oldGoldWeightG = new Prisma.Decimal(String(dto.oldGoldWeightG ?? 0));
    const oldGoldRatePerGram = new Prisma.Decimal(String(dto.oldGoldRatePerGram ?? 0));
    const isInterstate = dto.isInterstate ?? false;

    return this.pricing.computeInvoice(
      priceLineInputs,
      oldGoldWeightG,
      oldGoldRatePerGram,
      isInterstate,
      dto.billType !== BillType.ESTIMATE,
    );
  }

  // -------------------------------------------------------------------------
  // 3. listInvoices
  // -------------------------------------------------------------------------
  async listInvoices(query: ListInvoicesQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    if (query.customerId) where.customerId = query.customerId;
    if (query.status) where.status = query.status;

    if (query.from || query.to) {
      where.invoicedAt = {};
      if (query.from) (where.invoicedAt as Prisma.DateTimeFilter).gte = new Date(query.from);
      if (query.to) (where.invoicedAt as Prisma.DateTimeFilter).lte = new Date(query.to);
    }

    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { phone: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          _count: { select: { lines: true, payments: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // -------------------------------------------------------------------------
  // 4. getInvoice
  // -------------------------------------------------------------------------
  async getInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { include: { item: true } },
        payments: true,
        rateSnapshot: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!invoice) throw new NotFoundException(`Invoice ${id} not found.`);
    return invoice;
  }

  // -------------------------------------------------------------------------
  // 5. recordPayment
  // -------------------------------------------------------------------------
  async recordPayment(invoiceId: string, dto: RecordPaymentDto) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found.`);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot record payment on a cancelled invoice.');
    }

    const paymentAmount = new Prisma.Decimal(String(dto.amount));
    if (invoice.balanceDue.lessThanOrEqualTo(ZERO)) {
      throw new BadRequestException('This bill is already fully paid.');
    }
    if (paymentAmount.greaterThan(invoice.balanceDue)) {
      throw new BadRequestException(`Payment can't be more than the balance due (₹${invoice.balanceDue.toFixed(2)}).`);
    }
    const newAmountPaid = invoice.amountPaid.add(paymentAmount).toDecimalPlaces(2);
    const newBalanceDue = invoice.totalAmount.sub(newAmountPaid).toDecimalPlaces(2);

    const [payment, updatedInvoice] = await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          invoiceId,
          amount: paymentAmount,
          mode: dto.mode,
          reference: dto.reference,
        },
      }),
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue.lessThan(ZERO) ? ZERO : newBalanceDue,
        },
        include: {
          customer: true,
          lines: { include: { item: true } },
          payments: true,
          rateSnapshot: true,
        },
      }),
    ]);

    return { payment, invoice: updatedInvoice };
  }

  // -------------------------------------------------------------------------
  // 6. cancelInvoice
  // -------------------------------------------------------------------------
  async cancelInvoice(invoiceId: string, userId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { lines: true },
    });

    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found.`);

    if (
      invoice.status !== InvoiceStatus.DRAFT &&
      invoice.status !== InvoiceStatus.CONFIRMED &&
      invoice.status !== InvoiceStatus.IRN_PENDING
    ) {
      throw new BadRequestException(
        `Invoice cannot be cancelled. Current status: ${invoice.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Reverse stock movements: create IN movements and restore stockQty
      for (const line of invoice.lines) {
        // Manual lines and estimates never took stock out
        if (!line.itemId || invoice.billType === BillType.ESTIMATE) continue;
        await tx.stockMovement.create({
          data: {
            itemId: line.itemId,
            type: 'IN',
            qty: line.qty,
            reason: 'Cancellation of invoice ' + invoice.invoiceNumber,
            refId: invoice.id,
          },
        });

        await tx.item.update({
          where: { id: line.itemId },
          data: { stockQty: { increment: line.qty } },
        });
      }

      // Mark invoice cancelled
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.CANCELLED },
      });
    });

    // Reverse customer totalSpent (non-critical)
    this.prisma.customer
      .update({
        where: { id: invoice.customerId },
        data: { totalSpent: { decrement: invoice.totalAmount } },
      })
      .catch((err: Error) => this.logger.warn('Failed to reverse customer totalSpent: ' + err.message));

    this.logger.log(`Invoice ${invoice.invoiceNumber} cancelled by user ${userId}`);

    return this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        lines: { include: { item: true } },
        payments: true,
        rateSnapshot: true,
      },
    });
  }

  // -------------------------------------------------------------------------
  // 7. retryIrn
  // -------------------------------------------------------------------------
  async retryIrn(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found.`);

    if (
      invoice.status !== InvoiceStatus.IRN_PENDING &&
      invoice.status !== InvoiceStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `IRN retry is only allowed for CONFIRMED or IRN_PENDING invoices. Current status: ${invoice.status}`,
      );
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.IRN_PENDING },
    });

    this.irn.registerIrn(invoice.id, invoice.invoiceNumber).then((result) => {
      this.prisma.invoice
        .update({
          where: { id: invoice.id },
          data: { irn: result.irn, irnQrUrl: result.signedQrCode, status: InvoiceStatus.IRN_REGISTERED },
        })
        .catch((err: Error) => this.logger.error('Failed to persist IRN on retry: ' + err.message));
    }).catch((err: Error) => {
      this.logger.error('IRN retry failed for ' + invoice.invoiceNumber + ': ' + err.message);
    });

    return { message: 'IRN registration queued', invoiceId };
  }

  // -------------------------------------------------------------------------
  // 8. getInvoicePdf
  // -------------------------------------------------------------------------
  async getInvoicePdf(invoiceId: string): Promise<Buffer> {
    const invoice = await this.getInvoice(invoiceId);
    return this.pdf.generateInvoicePdf(invoice);
  }

  // -------------------------------------------------------------------------
  // 8. listCustomers
  // -------------------------------------------------------------------------
  async listCustomers(search?: string) {
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      phone: { not: BillingService.LEGACY_WALK_IN_PHONE },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  // -------------------------------------------------------------------------
  // 9. createCustomer
  // -------------------------------------------------------------------------
  async createCustomer(dto: CreateCustomerDto) {
    const existing = await this.prisma.customer.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException({
        message: `${existing.name} is already registered with phone ${dto.phone}.`,
        customer: { id: existing.id, name: existing.name, phone: existing.phone, email: existing.email, address: existing.address },
      });
    }

    return this.prisma.customer.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        panNumber: dto.panNumber,
      },
    });
  }

  // -------------------------------------------------------------------------
  // 10. getCustomerHistory
  // -------------------------------------------------------------------------
  async getCustomerHistory(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found.`);

    const invoices = await this.prisma.invoice.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        lines: { include: { item: { select: { id: true, name: true, sku: true } } } },
        payments: true,
        _count: { select: { lines: true } },
      },
    });

    const outstandingDue = invoices
      .filter((inv) => inv.status !== InvoiceStatus.CANCELLED)
      .reduce((acc, inv) => acc.add(inv.balanceDue), ZERO)
      .toDecimalPlaces(2);

    return {
      customer,
      invoices,
      summary: {
        totalInvoices: invoices.length,
        totalSpent: customer.totalSpent,
        outstandingDue,
      },
    };
  }
}
