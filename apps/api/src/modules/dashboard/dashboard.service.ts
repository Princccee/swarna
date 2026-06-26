import { Injectable } from '@nestjs/common';
import { InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const ZERO = new Prisma.Decimal(0);

interface RateCacheEntry {
  ratePerGram: number | string;
  snappedAt?: string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getSummary(): Promise<any> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // ------------------------------------------------------------------
    // Today's invoice aggregates
    // ------------------------------------------------------------------
    const todayAgg = await this.prisma.invoice.aggregate({
      where: {
        invoicedAt: { gte: todayStart, lt: todayEnd },
        status: { not: InvoiceStatus.CANCELLED },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    const todaySales = todayAgg._sum.totalAmount ?? ZERO;
    const todayCount = todayAgg._count.id;

    // ------------------------------------------------------------------
    // Outstanding dues across all non-cancelled invoices
    // ------------------------------------------------------------------
    const duesAgg = await this.prisma.invoice.aggregate({
      where: {
        status: { not: InvoiceStatus.CANCELLED },
        balanceDue: { gt: ZERO },
      },
      _sum: { balanceDue: true },
    });

    const outstandingDues = duesAgg._sum.balanceDue ?? ZERO;

    // ------------------------------------------------------------------
    // Pending orders count
    // ------------------------------------------------------------------
    const pendingOrdersCount = await this.prisma.order.count({
      where: {
        status: {
          in: [OrderStatus.CONFIRMED, OrderStatus.MAKING, OrderStatus.READY],
        },
      },
    });

    // ------------------------------------------------------------------
    // Low stock items (stockQty <= 2, active, not deleted)
    // ------------------------------------------------------------------
    const lowStockItems = await this.prisma.item.findMany({
      where: {
        stockQty: { lte: 2 },
        active: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQty: true,
      },
    });

    // ------------------------------------------------------------------
    // IRN failures (status = IRN_PENDING)
    // ------------------------------------------------------------------
    const irnFailures = await this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.IRN_PENDING },
      select: {
        id: true,
        invoiceNumber: true,
        createdAt: true,
      },
    });

    // ------------------------------------------------------------------
    // Recent audit activity — last 20 events with actor name
    // ------------------------------------------------------------------
    const recentActivity = await this.prisma.auditEvent.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 20,
      include: {
        actor: {
          select: { id: true, name: true },
        },
      },
    });

    // ------------------------------------------------------------------
    // Current metal rates from Redis
    // ------------------------------------------------------------------
    const [gold22, gold24, silver999] = await Promise.all([
      this.redis.getJson<RateCacheEntry>('rate:GOLD:GOLD_22K'),
      this.redis.getJson<RateCacheEntry>('rate:GOLD:GOLD_24K'),
      this.redis.getJson<RateCacheEntry>('rate:SILVER:SILVER_999'),
    ]);

    const currentRates = {
      GOLD_22K: gold22?.ratePerGram ?? null,
      GOLD_24K: gold24?.ratePerGram ?? null,
      SILVER_999: silver999?.ratePerGram ?? null,
    };

    return {
      todaySales,
      todayCount,
      outstandingDues,
      pendingOrdersCount,
      lowStockItems,
      irnFailures,
      recentActivity,
      currentRates,
    };
  }
}
