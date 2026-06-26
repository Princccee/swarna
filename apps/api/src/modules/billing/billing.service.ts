import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, InvoiceStatus, Metal, Purity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PricingService, PriceLineInput, InvoiceCalculation } from './pricing.service';
import { IrnService } from './irn.service';
import { PdfService } from './pdf.service';
import {
  CreateInvoiceDto,
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

  /** Get or create the generic walk-in customer used when no customerId is supplied. */
  private async getWalkInCustomer() {
    const WALK_IN_PHONE = '0000000000';
    const existing = await this.prisma.customer.findUnique({ where: { phone: WALK_IN_PHONE } });
    if (existing) return existing;
    return this.prisma.customer.create({
      data: { name: 'Walk-in Customer', phone: WALK_IN_PHONE },
    });
  }

  /** Fetch rate from Redis for a given purity. Throws BadRequestException if missing. */
  private async fetchRate(metal: Metal, purity: Purity): Promise<Prisma.Decimal> {
    const key = `rate:${metal}:${purity}`;
    const cached = await this.redis.getJson<RateCacheEntry>(key);
    if (!cached || cached.ratePerGram === undefined || cached.ratePerGram === null) {
      throw new BadRequestException(`Live rate not available for ${purity}. Please sync rates and retry.`);
    }
    return new Prisma.Decimal(String(cached.ratePerGram));
  }

  /** Generate the next invoice number for the current month. */
  private async nextInvoiceNumber(): Promise<string> {
    const prefix = 'SVR-' + yyyymm(new Date());
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
   * Resolve item data + rates for every line in the DTO.
   * Returns: priceLineInputs, itemMap (itemId → item), rateMap (purity → ratePerGram).
   */
  private async resolveLines(
    lines: Array<{ itemId: string; qty: number; netWeightG?: number }>,
  ): Promise<{
    priceLineInputs: PriceLineInput[];
    itemMap: Map<string, Awaited<ReturnType<typeof this.prisma.item.findUniqueOrThrow>>>;
    rateMap: Map<Purity, Prisma.Decimal>;
  }> {
    const itemIds = lines.map((l) => l.itemId);
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, active: true },
    });

    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Verify all items found
    for (const l of lines) {
      if (!itemMap.has(l.itemId)) {
        throw new NotFoundException(`Item ${l.itemId} not found or inactive.`);
      }
    }

    // Collect unique purities and fetch rates once each
    const uniquePurities = [...new Set(items.map((i) => i.purity))];
    const rateMap = new Map<Purity, Prisma.Decimal>();
    await Promise.all(
      uniquePurities.map(async (purity) => {
        const metal = metalFromPurity(purity);
        const rate = await this.fetchRate(metal, purity);
        rateMap.set(purity, rate);
      }),
    );

    // Build PriceLineInput array
    const priceLineInputs: PriceLineInput[] = lines.map((l) => {
      const item = itemMap.get(l.itemId)!;
      const netWeightG =
        l.netWeightG !== undefined
          ? new Prisma.Decimal(String(l.netWeightG))
          : item.netWeightG;
      const ratePerGram = rateMap.get(item.purity)!;

      return {
        itemId: item.id,
        qty: l.qty,
        netWeightG,
        ratePerGram,
        makingPct: item.makingPct,
        makingPerGram: item.makingPerGram,
        stoneValue: item.stoneValue,
      };
    });

    return { priceLineInputs, itemMap, rateMap };
  }

  // -------------------------------------------------------------------------
  // 1. createInvoice
  // -------------------------------------------------------------------------
  async createInvoice(dto: CreateInvoiceDto, userId: string) {
    const { priceLineInputs, itemMap, rateMap } = await this.resolveLines(dto.lines);

    const oldGoldWeightG = new Prisma.Decimal(String(dto.oldGoldWeightG ?? 0));
    const oldGoldRatePerGram = new Prisma.Decimal(String(dto.oldGoldRatePerGram ?? 0));
    const isInterstate = dto.isInterstate ?? false;

    // Compute pricing
    const calc = this.pricing.computeInvoice(
      priceLineInputs,
      oldGoldWeightG,
      oldGoldRatePerGram,
      isInterstate,
    );

    // Generate invoice number
    const invoiceNumber = await this.nextInvoiceNumber();

    // Resolve customer — use walk-in placeholder when none supplied
    const customer = dto.customerId
      ? await this.prisma.customer.findUnique({ where: { id: dto.customerId } })
      : await this.getWalkInCustomer();
    if (!customer) throw new NotFoundException(`Customer ${dto.customerId} not found.`);

    // Create one RateSnapshot per unique purity (use the first purity's snapshot as the invoice's primary snapshot)
    const snapshotIds = new Map<Purity, string>();
    for (const [purity, ratePerGram] of rateMap.entries()) {
      const metal = metalFromPurity(purity);
      const snapshot = await this.prisma.rateSnapshot.create({
        data: {
          metal,
          purity,
          ratePerGram,
          source: 'redis-cache',
        },
      });
      snapshotIds.set(purity, snapshot.id);
    }

    // The invoice's rateSnapshotId: use the first item's purity snapshot
    const firstItemPurity = itemMap.get(dto.lines[0].itemId)!.purity;
    const primarySnapshotId = snapshotIds.get(firstItemPurity)!;

    // Build transaction operations
    const invoice = await this.prisma.$transaction(async (tx) => {
      // Create the invoice
      const created = await tx.invoice.create({
        data: {
          customer: { connect: { id: customer.id } },
          rateSnapshot: { connect: { id: primarySnapshotId } },
          createdBy: { connect: { id: userId } },
          invoiceNumber,
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
          balanceDue: calc.totalAmount,
          status: InvoiceStatus.CONFIRMED,
          notes: dto.notes,
          invoicedAt: new Date(),
          lines: {
            create: calc.lines.map((l) => ({
              item: { connect: { id: l.itemId } },
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
        include: {
          customer: true,
          lines: { include: { item: true } },
          payments: true,
          rateSnapshot: true,
        },
      });

      // Decrement stockQty and create StockMovement (OUT) for each line
      for (const lineDto of dto.lines) {
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

      // Create Payment record if paymentMode supplied
      if (dto.paymentMode) {
        const paid = new Prisma.Decimal(String(dto.paymentAmount ?? calc.totalAmount));
        const balanceDue = calc.totalAmount.sub(paid).toDecimalPlaces(2);
        await tx.payment.create({
          data: { invoice: { connect: { id: created.id } }, amount: paid, mode: dto.paymentMode },
        });
        await tx.invoice.update({
          where: { id: created.id },
          data: { amountPaid: paid, balanceDue },
        });
      }

      // Create RegisterEntry (SALES)
      await tx.registerEntry.create({
        data: {
          createdById: userId,
          refInvoiceId: created.id,
          registerType: 'SALES',
          description: `Invoice ${invoiceNumber}`,
          amount: calc.totalAmount,
        },
      });

      // Re-fetch so response includes payment + updated amounts
      return tx.invoice.findUniqueOrThrow({
        where: { id: created.id },
        include: { customer: true, lines: { include: { item: true } }, payments: true, rateSnapshot: true },
      });
    });

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
  // 7. getInvoicePdf
  // -------------------------------------------------------------------------
  async getInvoicePdf(invoiceId: string): Promise<Buffer> {
    const invoice = await this.getInvoice(invoiceId);
    return this.pdf.generateInvoicePdf(invoice);
  }

  // -------------------------------------------------------------------------
  // 8. listCustomers
  // -------------------------------------------------------------------------
  async listCustomers(search?: string) {
    const where: Prisma.CustomerWhereInput = { deletedAt: null };

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
      throw new BadRequestException(`Customer with phone ${dto.phone} already exists.`);
    }

    return this.prisma.customer.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
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
