import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, OrderStatus } from '@prisma/client';
import {
  CreateOrderDto,
  UpdateOrderDto,
  UpdateOrderStatusDto,
  OrderPaymentDto,
  KarigarEntryDto,
} from './dto/order.dto';

const VALID_TRANSITIONS: Record<string, OrderStatus[]> = {
  DRAFT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.MAKING, OrderStatus.CANCELLED],
  MAKING: [OrderStatus.READY],
  READY: [OrderStatus.INVOICED],
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── helpers ──────────────────────────────────────────────────────────────

  private async generateOrderNumber(): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const last = await this.prisma.order.findFirst({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    let seq = 1;
    if (last) {
      const parts = last.orderNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `ORD-${datePart}-${String(seq).padStart(4, '0')}`;
  }

  // ── methods ───────────────────────────────────────────────────────────────

  async createOrder(dto: CreateOrderDto): Promise<any> {
    const orderNumber = await this.generateOrderNumber();
    const advancePaid = dto.advancePaid ?? 0;
    const estimatedValue = dto.estimatedValue ?? 0;
    const balanceDue = estimatedValue - advancePaid;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          customerId: dto.customerId,
          type: dto.type,
          description: dto.description,
          metalPurity: dto.metalPurity,
          estimatedWeightG: dto.estimatedWeightG,
          estimatedValue: dto.estimatedValue,
          advancePaid,
          balanceDue,
          expectedReady: dto.expectedReady ? new Date(dto.expectedReady) : undefined,
          assignedToId: dto.assignedToId,
          notes: dto.notes,
        },
        include: {
          customer: true,
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      });

      if (advancePaid > 0) {
        await tx.orderPayment.create({
          data: {
            orderId: created.id,
            amount: advancePaid,
            mode: 'CASH', // default mode for advance at creation
          },
        });
      }

      return created;
    });

    return order;
  }

  async listOrders(query: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    customerId?: string;
    assignedToId?: string;
    dueSoon?: boolean;
  }): Promise<any> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (query.status) where.status = query.status as OrderStatus;
    if (query.type) where.type = query.type as any;
    if (query.customerId) where.customerId = query.customerId;
    if (query.assignedToId) where.assignedToId = query.assignedToId;

    if (query.dueSoon) {
      const now = new Date();
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      where.expectedReady = { lte: threeDaysLater };
      where.status = { notIn: [OrderStatus.INVOICED, OrderStatus.CANCELLED] };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { payments: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrder(id: string): Promise<any> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        payments: { orderBy: { paidAt: 'desc' } },
        karigarEntries: {
          include: {
            karigar: { select: { id: true, name: true, email: true } },
          },
          orderBy: { entryAt: 'desc' },
        },
      },
    });

    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async updateOrder(id: string, dto: UpdateOrderDto): Promise<any> {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Order ${id} not found`);

    const data: Prisma.OrderUpdateInput = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.metalPurity !== undefined) data.metalPurity = dto.metalPurity;
    if (dto.estimatedWeightG !== undefined) data.estimatedWeightG = dto.estimatedWeightG;
    if (dto.estimatedValue !== undefined) {
      data.estimatedValue = dto.estimatedValue;
      // Recalculate balance when estimated value changes
      data.balanceDue = dto.estimatedValue - Number(existing.advancePaid);
    }
    if (dto.expectedReady !== undefined) data.expectedReady = new Date(dto.expectedReady);
    if (dto.assignedToId !== undefined) data.assignedTo = { connect: { id: dto.assignedToId } };
    if (dto.notes !== undefined) data.notes = dto.notes;

    return this.prisma.order.update({ where: { id }, data });
  }

  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    const currentStatus = order.status as string;
    const newStatus = dto.status as OrderStatus;

    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition order from ${currentStatus} to ${dto.status}`,
      );
    }

    const data: Prisma.OrderUpdateInput = { status: newStatus };

    if (newStatus === OrderStatus.INVOICED) {
      if (!dto.invoiceId) {
        throw new BadRequestException('invoiceId is required when marking order as INVOICED');
      }
      data.invoice = { connect: { id: dto.invoiceId } };
    }

    return this.prisma.order.update({ where: { id }, data });
  }

  async recordOrderPayment(orderId: string, dto: OrderPaymentDto): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.orderPayment.create({
        data: {
          orderId,
          amount: dto.amount,
          mode: dto.mode,
          reference: dto.reference,
        },
      });

      const newAdvancePaid = Number(order.advancePaid) + dto.amount;
      const estimatedValue = Number(order.estimatedValue ?? 0);
      const newBalanceDue = estimatedValue - newAdvancePaid;

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          advancePaid: newAdvancePaid,
          balanceDue: newBalanceDue,
        },
      });

      return { payment, order: updated };
    });

    return result;
  }

  async cancelOrder(id: string): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException(
        `Cannot cancel order in status ${order.status}. Only DRAFT or CONFIRMED orders can be cancelled.`,
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
    });
  }

  async addKarigarEntry(orderId: string, dto: KarigarEntryDto): Promise<any> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    return this.prisma.karigarLedger.create({
      data: {
        karigarUserId: dto.karigarUserId,
        orderId,
        entryType: dto.entryType as any,
        goldWeightG: dto.goldWeightG,
        metal: dto.metal as any,
        purity: dto.purity as any,
        notes: dto.notes,
      },
      include: {
        karigar: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });
  }

  async getKarigarBalance(): Promise<any[]> {
    // Aggregate issued and returned weights per karigar
    const [issued, returned] = await this.prisma.$transaction([
      this.prisma.karigarLedger.groupBy({
        by: ['karigarUserId'],
        where: { entryType: 'ISSUED' },
        _sum: { goldWeightG: true },
        orderBy: { karigarUserId: 'asc' },
      }),
      this.prisma.karigarLedger.groupBy({
        by: ['karigarUserId'],
        where: { entryType: 'RETURNED' },
        _sum: { goldWeightG: true },
        orderBy: { karigarUserId: 'asc' },
      }),
    ]);

    // Collect all unique karigar IDs
    const karigarIds = [
      ...new Set([
        ...issued.map((r) => r.karigarUserId),
        ...returned.map((r) => r.karigarUserId),
      ]),
    ];

    const karigars = await this.prisma.user.findMany({
      where: { id: { in: karigarIds } },
      select: { id: true, name: true, email: true },
    });

    const issuedMap = new Map(issued.map((r) => [r.karigarUserId, Number(r._sum?.goldWeightG ?? 0)]));
    const returnedMap = new Map(returned.map((r) => [r.karigarUserId, Number(r._sum?.goldWeightG ?? 0)]));

    return karigars.map((k) => {
      const issuedG = issuedMap.get(k.id) ?? 0;
      const returnedG = returnedMap.get(k.id) ?? 0;
      return {
        karigar: k,
        issuedG,
        returnedG,
        balanceG: issuedG - returnedG,
      };
    });
  }

  async getKarigarLedger(query: {
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    karigarUserId?: string;
  }): Promise<any> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.KarigarLedgerWhereInput = {};

    if (query.karigarUserId) where.karigarUserId = query.karigarUserId;

    if (query.from || query.to) {
      where.entryAt = {};
      if (query.from) (where.entryAt as any).gte = new Date(query.from);
      if (query.to) (where.entryAt as any).lte = new Date(query.to);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.karigarLedger.findMany({
        where,
        skip,
        take: limit,
        orderBy: { entryAt: 'desc' },
        include: {
          karigar: { select: { id: true, name: true } },
          order: { select: { id: true, orderNumber: true } },
        },
      }),
      this.prisma.karigarLedger.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
