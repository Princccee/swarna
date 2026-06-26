import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      orderPayment: { create: jest.fn() },
      karigarLedger: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        if (typeof fn === 'function') return fn(prisma);
        // Array form used by listOrders / getKarigarLedger
        return Promise.all(fn as any);
      }),
    };
    service = new OrdersService(prisma as any);
  });

  // ── 1. createOrder ──────────────────────────────────────────────────────────

  describe('createOrder', () => {
    it('generates an orderNumber in ORD-YYYYMMDD-0001 format and creates the order', async () => {
      // No existing order today → sequence starts at 1
      prisma.order.findFirst.mockResolvedValue(null);

      const mockOrder = {
        id: 'order-1',
        orderNumber: 'ORD-20260626-0001',
        customerId: 'cust-1',
        type: 'RING',
        advancePaid: 0,
        balanceDue: 5000,
        estimatedValue: 5000,
        customer: { id: 'cust-1', name: 'Test Customer' },
        assignedTo: null,
      };
      prisma.order.create.mockResolvedValue(mockOrder);

      const dto = {
        customerId: 'cust-1',
        type: 'RING' as any,
        estimatedValue: 5000,
      };

      const result = await service.createOrder(dto as any);

      expect(prisma.order.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.order.create).toHaveBeenCalledTimes(1);

      const createArgs = prisma.order.create.mock.calls[0][0];
      expect(createArgs.data.orderNumber).toMatch(/^ORD-\d{8}-0001$/);
      expect(result.orderNumber).toBe('ORD-20260626-0001');
    });
  });

  // ── 2. listOrders ───────────────────────────────────────────────────────────

  describe('listOrders', () => {
    it('returns items with pagination meta', async () => {
      const fakeItems = [{ id: 'o1' }, { id: 'o2' }];
      const fakeTotal = 42;

      // $transaction receives an array in listOrders
      prisma.$transaction.mockResolvedValue([fakeItems, fakeTotal]);

      const result = await service.listOrders({ page: 2, limit: 10 });

      expect(result.items).toEqual(fakeItems);
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 42,
        totalPages: 5,
      });
    });
  });

  // ── 3. getOrder — found ─────────────────────────────────────────────────────

  describe('getOrder', () => {
    it('returns the order when it exists', async () => {
      const fakeOrder = {
        id: 'order-abc',
        orderNumber: 'ORD-20260626-0001',
        customer: {},
        payments: [],
        karigarEntries: [],
      };
      prisma.order.findUnique.mockResolvedValue(fakeOrder);

      const result = await service.getOrder('order-abc');

      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-abc' } }),
      );
      expect(result).toEqual(fakeOrder);
    });

    // ── 4. getOrder — not found ───────────────────────────────────────────────

    it('throws NotFoundException when order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.getOrder('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── 5. updateOrderStatus — valid transition DRAFT → CONFIRMED ───────────────

  describe('updateOrderStatus', () => {
    it('allows a valid transition from DRAFT to CONFIRMED', async () => {
      const existingOrder = { id: 'order-1', status: 'DRAFT' };
      const updatedOrder = { id: 'order-1', status: 'CONFIRMED' };

      prisma.order.findUnique.mockResolvedValue(existingOrder);
      prisma.order.update.mockResolvedValue(updatedOrder);

      const result = await service.updateOrderStatus('order-1', { status: 'CONFIRMED' as any });

      expect(prisma.order.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' } }),
      );
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          data: expect.objectContaining({ status: 'CONFIRMED' }),
        }),
      );
      expect(result.status).toBe('CONFIRMED');
    });

    // ── 6. updateOrderStatus — invalid transition CONFIRMED → INVOICED ─────────

    it('throws BadRequestException for an invalid transition CONFIRMED → INVOICED', async () => {
      const existingOrder = { id: 'order-2', status: 'CONFIRMED' };
      prisma.order.findUnique.mockResolvedValue(existingOrder);

      await expect(
        service.updateOrderStatus('order-2', { status: 'INVOICED' as any }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.order.update).not.toHaveBeenCalled();
    });
  });
});
