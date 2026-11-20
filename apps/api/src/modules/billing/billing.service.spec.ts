import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BillingService } from './billing.service';
import { PricingService } from './pricing.service';

const D = (v: string | number) => new Prisma.Decimal(String(v));
const LIVE_RATE = 6000;

const ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  purity: 'GOLD_22K',
  netWeightG: D('10'),
  makingPct: D('0'),
  makingPerGram: D('0'),
  stoneValue: D('0'),
  active: true,
};
const CUSTOMER = { id: '22222222-2222-4222-8222-222222222222', phone: '9876543210', deletedAt: null };

function setup() {
  const prisma: any = {
    item: { findMany: jest.fn().mockResolvedValue([ITEM]), update: jest.fn() },
    customer: { findFirst: jest.fn().mockResolvedValue(CUSTOMER), update: jest.fn().mockReturnValue({ catch: () => undefined }) },
    rateSnapshot: { create: jest.fn().mockResolvedValue({ id: 'snap-1' }) },
    invoice: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'inv-1', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'inv-1', ...data })),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'inv-1' }),
    },
    payment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }) },
    stockMovement: { create: jest.fn() },
    registerEntry: { create: jest.fn() },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  const redis: any = {
    getJson: jest.fn().mockResolvedValue({ ratePerGram: LIVE_RATE, snappedAt: new Date().toISOString(), source: 'manual' }),
  };
  const irn: any = { registerIrn: jest.fn().mockReturnValue(new Promise(() => undefined)) };
  const svc = new BillingService(prisma, redis, new PricingService(), irn, {} as any);
  return { svc, prisma, redis };
}

describe('BillingService — per-item rate', () => {
  it('uses the live rate for an inventory item when no rate is given', async () => {
    const { svc, redis } = setup();
    const calc = await svc.previewInvoice({ lines: [{ itemId: ITEM.id, qty: 1 }] } as any);
    expect(Number(calc.lines[0].ratePerGram)).toBe(LIVE_RATE);
    expect(redis.getJson).toHaveBeenCalled();
  });

  it('uses the rate typed at the counter for an inventory item, without needing a live rate', async () => {
    const { svc, redis } = setup();
    redis.getJson.mockResolvedValue(null); // no live rate at all — must not block an edited rate
    const calc = await svc.previewInvoice({ lines: [{ itemId: ITEM.id, qty: 1, ratePerGram: 6500 }] } as any);
    expect(Number(calc.lines[0].ratePerGram)).toBe(6500);
    expect(Number(calc.lines[0].lineTotal)).toBe(65000); // 10 g × 6500, no making/stone
    expect(redis.getJson).not.toHaveBeenCalled();
  });

  it('records an edited rate on the bill as a manual rate snapshot', async () => {
    const { svc, prisma } = setup();
    await svc.createInvoice(
      { customerId: CUSTOMER.id, lines: [{ itemId: ITEM.id, qty: 1, ratePerGram: 6500 }] } as any,
      'user-1',
    );
    expect(prisma.rateSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ratePerGram: D(6500), source: 'manual-bill' }),
    });
  });
});

describe('BillingService — non-GST (estimate) bills', () => {
  it('takes a partial payment and leaves the rest due, without GST', async () => {
    const { svc, prisma } = setup();
    await svc.createInvoice(
      {
        customerId: CUSTOMER.id,
        billType: 'ESTIMATE',
        lines: [{ itemId: ITEM.id, qty: 1 }],
        paymentMode: 'CASH',
        paymentAmount: 20000,
      } as any,
      'user-1',
    );

    const created = prisma.invoice.create.mock.calls[0][0].data;
    expect(created.billType).toBe('ESTIMATE');
    expect(Number(created.cgst) + Number(created.sgst) + Number(created.igst)).toBe(0);
    expect(Number(created.totalAmount)).toBe(60000);
    expect(Number(created.balanceDue)).toBe(60000); // owed until paid
    expect(created.status).toBe('CONFIRMED');

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: D(20000), mode: 'CASH' }),
    });
    const settled = prisma.invoice.update.mock.calls.at(-1)[0].data;
    expect(Number(settled.amountPaid)).toBe(20000);
    expect(Number(settled.balanceDue)).toBe(40000);
  });

  it('a GST bill charges 3% GST and the same payment rules apply', async () => {
    const { svc, prisma } = setup();
    await svc.createInvoice(
      { customerId: CUSTOMER.id, lines: [{ itemId: ITEM.id, qty: 1 }], paymentMode: 'UPI', paymentAmount: 10000 } as any,
      'user-1',
    );
    const created = prisma.invoice.create.mock.calls[0][0].data;
    expect(Number(created.totalAmount)).toBe(61800); // 60000 + 3%
    const settled = prisma.invoice.update.mock.calls.at(-1)[0].data;
    expect(Number(settled.balanceDue)).toBe(51800);
  });

  it('refuses a payment larger than the bill', async () => {
    const { svc } = setup();
    await expect(
      svc.createInvoice(
        { customerId: CUSTOMER.id, billType: 'ESTIMATE', lines: [{ itemId: ITEM.id, qty: 1 }], paymentMode: 'CASH', paymentAmount: 70000 } as any,
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('BillingService.recordPayment', () => {
  const invoice = (over: any = {}) => ({
    id: 'inv-1', status: 'CONFIRMED', billType: 'ESTIMATE',
    totalAmount: D('110931.46'), amountPaid: D('50000'), balanceDue: D('60931.46'), ...over,
  });

  it('settles the full balance ("Mark as Paid") on an estimate', async () => {
    const { svc, prisma } = setup();
    prisma.invoice.findUnique.mockResolvedValue(invoice());
    await svc.recordPayment('inv-1', { amount: 60931.46, mode: 'CASH' } as any);
    const data = prisma.invoice.update.mock.calls[0][0].data;
    expect(Number(data.amountPaid)).toBe(110931.46);
    expect(Number(data.balanceDue)).toBe(0);
  });

  it('refuses more than the balance due', async () => {
    const { svc, prisma } = setup();
    prisma.invoice.findUnique.mockResolvedValue(invoice());
    await expect(svc.recordPayment('inv-1', { amount: 60931.47 + 1, mode: 'CASH' } as any)).rejects.toThrow(BadRequestException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('refuses a payment on a bill that is already fully paid', async () => {
    const { svc, prisma } = setup();
    prisma.invoice.findUnique.mockResolvedValue(invoice({ amountPaid: D('110931.46'), balanceDue: D('0') }));
    await expect(svc.recordPayment('inv-1', { amount: 1, mode: 'CASH' } as any)).rejects.toThrow(BadRequestException);
  });
});
