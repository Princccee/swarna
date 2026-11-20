import { Prisma } from '@prisma/client';
import { DashboardService } from './dashboard.service';

describe('DashboardService — outstanding dues', () => {
  it('counts dues on GST and non-GST bills alike (a due is a due)', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { totalAmount: new Prisma.Decimal(0), balanceDue: new Prisma.Decimal(0) }, _count: { id: 0 } });
    const prisma: any = new Proxy(
      { invoice: { aggregate, findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } },
      {
        // Any other model the summary touches: harmless empty answers
        get: (target: any, prop: string) =>
          target[prop] ??
          new Proxy({}, { get: () => jest.fn().mockResolvedValue(prop === '$transaction' ? [] : 0) }),
      },
    );
    const redis: any = { getJson: jest.fn().mockResolvedValue(null), get: jest.fn().mockResolvedValue(null) };

    await new DashboardService(prisma, redis).getSummary().catch(() => undefined);

    const duesCall = aggregate.mock.calls.find(([arg]: any[]) => arg?._sum?.balanceDue);
    expect(duesCall).toBeDefined();
    expect(duesCall[0].where).not.toHaveProperty('billType');
    expect(duesCall[0].where.balanceDue).toEqual({ gt: new Prisma.Decimal(0) });
  });
});
