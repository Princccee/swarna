import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class RegistersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── 1. Sales Register ────────────────────────────────────────────────────

  async getSalesRegister(query: {
    from: string;
    to: string;
    page?: number;
    limit?: number;
  }) {
    const { from, to, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const where: Prisma.InvoiceWhereInput = {
      invoicedAt: { gte: fromDate, lte: toDate },
      status: { not: 'CANCELLED' },
    };

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { invoicedAt: 'asc' },
        include: {
          customer: { select: { name: true, phone: true } },
          payments: true,
          lines: true,
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const aggregates = await this.prisma.invoice.aggregate({
      where,
      _sum: {
        totalAmount: true,
        amountPaid: true,
        balanceDue: true,
      },
    });

    const countByMode: Record<string, number> = {};
    for (const inv of rows) {
      for (const payment of inv.payments) {
        const mode = payment.mode as string;
        countByMode[mode] = (countByMode[mode] ?? 0) + 1;
      }
    }

    return {
      rows,
      totals: {
        totalAmount: aggregates._sum.totalAmount ?? 0,
        totalPaid: aggregates._sum.amountPaid ?? 0,
        totalDue: aggregates._sum.balanceDue ?? 0,
        countByMode,
      },
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 2. Purchase Register ─────────────────────────────────────────────────

  async getPurchaseRegister(query: {
    from: string;
    to: string;
    page?: number;
    limit?: number;
  }) {
    const { from, to, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const where: Prisma.RegisterEntryWhereInput = {
      registerType: 'PURCHASE',
      entryDate: { gte: fromDate, lte: toDate },
    };

    const [rows, total, aggregates] = await Promise.all([
      this.prisma.registerEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { entryDate: 'asc' },
        include: {
          createdBy: { select: { name: true } },
        },
      }),
      this.prisma.registerEntry.count({ where }),
      this.prisma.registerEntry.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    return {
      rows,
      totals: {
        totalAmount: aggregates._sum.amount ?? 0,
      },
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 3. Old Gold Register ─────────────────────────────────────────────────

  async getOldGoldRegister(query: {
    from: string;
    to: string;
    page?: number;
    limit?: number;
  }) {
    const { from, to, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const where: Prisma.InvoiceWhereInput = {
      oldGoldDeduction: { gt: 0 },
      invoicedAt: { gte: fromDate, lte: toDate },
    };

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { invoicedAt: 'asc' },
        select: {
          invoiceNumber: true,
          invoicedAt: true,
          oldGoldWeightG: true,
          oldGoldRatePerGram: true,
          oldGoldDeduction: true,
          customer: { select: { name: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const rows = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customer?.name ?? null,
      oldGoldWeightG: inv.oldGoldWeightG,
      oldGoldRatePerGram: inv.oldGoldRatePerGram,
      oldGoldDeduction: inv.oldGoldDeduction,
      date: inv.invoicedAt,
    }));

    return {
      rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 4. HUID Log ──────────────────────────────────────────────────────────

  async getHuidLog(query: {
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { from, to, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.HuidLogWhereInput = {};

    if (from || to) {
      where.loggedAt = {};
      if (from) {
        (where.loggedAt as Prisma.DateTimeFilter).gte = new Date(from);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        (where.loggedAt as Prisma.DateTimeFilter).lte = toDate;
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.huidLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { loggedAt: 'desc' },
        include: {
          item: { select: { name: true, sku: true } },
        },
      }),
      this.prisma.huidLog.count({ where }),
    ]);

    return {
      rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 5. Audit Trail ───────────────────────────────────────────────────────

  async getAuditTrail(query: {
    entityType?: string;
    actorId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { entityType, actorId, from, to, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditEventWhereInput = {};

    if (entityType) where.entityType = entityType;
    if (actorId) where.actorId = actorId;

    if (from || to) {
      where.occurredAt = {};
      if (from) {
        (where.occurredAt as Prisma.DateTimeFilter).gte = new Date(from);
      }
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        (where.occurredAt as Prisma.DateTimeFilter).lte = toDate;
      }
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { occurredAt: 'desc' },
        include: {
          actor: { select: { name: true, email: true } },
        },
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return {
      rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 6. Stock Audit ───────────────────────────────────────────────────────

  async getStockAudit() {
    const items = await this.prisma.item.findMany({
      where: {
        deletedAt: null,
        active: true,
      },
      include: {
        category: { select: { name: true } },
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      stockQty: item.stockQty,
      category: item.category,
      lastMovement: item.stockMovements[0] ?? null,
      // Live valuation is computed client-side or via a separate price feed
      liveValuation: null,
    }));
  }

  // ─── 7. KYC Register ──────────────────────────────────────────────────────

  async getKycRegister(query: { page?: number; limit?: number }) {
    const { page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          name: true,
          phone: true,
          email: true,
          panNumber: true,
          kycVerified: true,
          totalSpent: true,
          createdAt: true,
        },
      }),
      this.prisma.customer.count(),
    ]);

    return {
      rows: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── 8. GSTR-1 Data ───────────────────────────────────────────────────────

  async getGstr1Data(query: { from: string; to: string }) {
    const { from, to } = query;

    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const where: Prisma.InvoiceWhereInput = {
      invoicedAt: { gte: fromDate, lte: toDate },
      status: { in: ['CONFIRMED', 'IRN_REGISTERED'] },
    };

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { name: true, panNumber: true } },
      },
    });

    const b2c: Array<{
      invoiceNumber: string;
      date: Date | null;
      totalAmount: number;
      taxableValue: number;
      cgst: number;
      sgst: number;
      igst: number;
    }> = [];

    const b2b: Array<{
      invoiceNumber: string;
      date: Date | null;
      customerName: string;
      panNumber: string;
      totalAmount: number;
      taxableValue: number;
      cgst: number;
      sgst: number;
      igst: number;
    }> = [];

    let hsnTaxableValue = new Prisma.Decimal(0);
    let hsnCgst = new Prisma.Decimal(0);
    let hsnSgst = new Prisma.Decimal(0);
    let hsnIgst = new Prisma.Decimal(0);

    for (const inv of invoices) {
      const taxableValue = inv.taxableAmount ?? new Prisma.Decimal(0);
      const cgst = inv.cgst ?? new Prisma.Decimal(0);
      const sgst = inv.sgst ?? new Prisma.Decimal(0);
      const igst = inv.igst ?? new Prisma.Decimal(0);

      hsnTaxableValue = hsnTaxableValue.plus(taxableValue);
      hsnCgst = hsnCgst.plus(cgst);
      hsnSgst = hsnSgst.plus(sgst);
      hsnIgst = hsnIgst.plus(igst);

      const hasPan = Boolean(inv.customer?.panNumber);

      if (hasPan && inv.customer) {
        b2b.push({
          invoiceNumber: inv.invoiceNumber,
          date: inv.invoicedAt,
          customerName: inv.customer.name,
          panNumber: inv.customer.panNumber!,
          totalAmount: Number(inv.totalAmount),
          taxableValue: Number(taxableValue),
          cgst: Number(cgst),
          sgst: Number(sgst),
          igst: Number(igst),
        });
      } else {
        b2c.push({
          invoiceNumber: inv.invoiceNumber,
          date: inv.invoicedAt,
          totalAmount: Number(inv.totalAmount),
          taxableValue: Number(taxableValue),
          cgst: Number(cgst),
          sgst: Number(sgst),
          igst: Number(igst),
        });
      }
    }

    const totalTax = hsnCgst.plus(hsnSgst).plus(hsnIgst);

    return {
      b2c,
      b2b,
      hsn: {
        hsnCode: '7113',
        taxableValue: Number(hsnTaxableValue),
        cgst: Number(hsnCgst),
        sgst: Number(hsnSgst),
        igst: Number(hsnIgst),
        totalTax: Number(totalTax),
      },
    };
  }

  // ─── 9. GSTR-3B Summary ───────────────────────────────────────────────────

  async getGstr3bSummary(query: { month: number; year: number }) {
    const { month, year } = query;

    // month is 1-indexed (1 = January)
    const fromDate = new Date(year, month - 1, 1);
    const toDate = new Date(year, month, 0, 23, 59, 59, 999);

    const where: Prisma.InvoiceWhereInput = {
      invoicedAt: { gte: fromDate, lte: toDate },
      status: { in: ['CONFIRMED', 'IRN_REGISTERED'] },
    };

    const aggregates = await this.prisma.invoice.aggregate({
      where,
      _sum: {
        taxableAmount: true,
        igst: true,
        cgst: true,
        sgst: true,
      },
    });

    const taxableValue = Number(aggregates._sum?.taxableAmount ?? 0);
    const igst = Number(aggregates._sum?.igst ?? 0);
    const cgst = Number(aggregates._sum?.cgst ?? 0);
    const sgst = Number(aggregates._sum?.sgst ?? 0);
    const totalTaxLiability = igst + cgst + sgst;

    return {
      outwardSupplies: {
        taxableValue,
        igst,
        cgst,
        sgst,
      },
      totalTaxLiability,
    };
  }
}
