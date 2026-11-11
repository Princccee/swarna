import { RateSyncService, METALSDEV_MONTHLY_BUDGET } from './rate-sync.service';
import { istMonth } from './rate-math';

/** Minimal in-memory stand-in for RedisService (TTL ignored). */
function fakeRedis() {
  const m = new Map<string, string>();
  return {
    store: m,
    get: jest.fn(async (k: string) => m.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => { m.set(k, v); }),
    del: jest.fn(async (k: string) => (m.delete(k) ? 1 : 0)),
    keys: jest.fn(async (p: string) => [...m.keys()].filter((k) => k.startsWith(p.replace('*', '')))),
    getJson: jest.fn(async (k: string) => (m.has(k) ? JSON.parse(m.get(k)!) : null)),
    setJson: jest.fn(async (k: string, v: unknown) => { m.set(k, JSON.stringify(v)); }),
    setIfAbsent: jest.fn(async (k: string, v: string) => { if (m.has(k)) return false; m.set(k, v); return true; }),
    incrWithTtl: jest.fn(async (k: string) => { const n = (Number(m.get(k)) || 0) + 1; m.set(k, String(n)); return n; }),
  };
}

function setup(settings: Record<string, string>) {
  const redis = fakeRedis();
  const prisma = {
    setting: { findMany: jest.fn().mockResolvedValue(Object.entries(settings).map(([key, value]) => ({ key, value }))) },
    rateSnapshot: { create: jest.fn().mockResolvedValue({}) },
  };
  const gateway = { broadcastRateUpdate: jest.fn() };
  const svc = new RateSyncService(prisma as any, redis as any, gateway as any);
  return { svc, redis, prisma, gateway };
}

const ok = (metals: Record<string, number>) => ({
  ok: true, status: 200,
  json: async () => ({ status: 'success', currency: 'INR', unit: 'g', metals }),
});

const rate = (redis: ReturnType<typeof fakeRedis>, key: string) => JSON.parse(redis.store.get(key)!);

describe('RateSyncService.syncFromMetalsDev', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('requires an API key', async () => {
    const { svc } = setup({});
    expect(await svc.syncFromMetalsDev('manual')).toMatchObject({ status: 'error', message: expect.stringContaining('not set') });
  });

  it('fetches INR/gram, applies premium + fineness, stores per-gram rates with source', async () => {
    const fetchMock = jest.fn().mockResolvedValue(ok({ ibja_gold: 14000, mcx_silver: 190 }));
    global.fetch = fetchMock as any;
    const { svc, redis, gateway } = setup({ metalsDevApiKey: 'KEY123', goldPremiumPer10g: '500', silverPremiumPer10g: '20' });

    const res = await svc.syncFromMetalsDev('manual');

    expect(res.status).toBe('applied');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('https://api.metals.dev/v1/latest?api_key=KEY123');
    expect(url).toContain('currency=INR');
    expect(url).toContain('unit=g');
    expect(rate(redis, 'rate:GOLD:GOLD_24K')).toMatchObject({ ratePerGram: 14050, source: 'metals.dev' });
    expect(rate(redis, 'rate:GOLD:GOLD_22K').ratePerGram).toBeCloseTo(12869.8);
    expect(rate(redis, 'rate:SILVER:SILVER_999').ratePerGram).toBe(192);
    expect(gateway.broadcastRateUpdate).toHaveBeenCalledWith(expect.objectContaining({ purity: 'GOLD_24K', source: 'metals.dev' }));
    expect(redis.store.get(`ratesync:metalsdev:calls:${istMonth()}`)).toBe('1');
    // No internal bookkeeping key may look like a price key
    expect([...redis.store.keys()].filter((k) => k.startsWith('rate:') && !/^rate:(GOLD|SILVER|PLATINUM):/.test(k))).toEqual([]);
  });

  it('holds a big jump for approval, then applies it on approve', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ ibja_gold: 15000, mcx_silver: 190 })) as any;
    const { svc, redis } = setup({ metalsDevApiKey: 'K', rateMaxChangePct: '3' });
    await redis.setJson('rate:GOLD:GOLD_24K', { ratePerGram: 14000, snappedAt: new Date().toISOString(), source: 'metals.dev' });

    const res = await svc.syncFromMetalsDev('schedule');
    expect(res.status).toBe('pending');
    expect(rate(redis, 'rate:GOLD:GOLD_24K').ratePerGram).toBe(14000); // unchanged

    await svc.approvePending();
    expect(rate(redis, 'rate:GOLD:GOLD_24K').ratePerGram).toBe(15000);
    expect(redis.store.has('ratesync:pending')).toBe(false);
  });

  it('ignores demo rates when checking for jumps', async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ ibja_gold: 14000, mcx_silver: 190 })) as any;
    const { svc, redis } = setup({ metalsDevApiKey: 'K' });
    await redis.setJson('rate:GOLD:GOLD_24K', { ratePerGram: 6500, snappedAt: new Date().toISOString(), source: 'mock' });
    expect((await svc.syncFromMetalsDev('startup')).status).toBe('applied');
  });

  it("does not overwrite today's manual rates", async () => {
    global.fetch = jest.fn().mockResolvedValue(ok({ ibja_gold: 14000, mcx_silver: 190 })) as any;
    const { svc, redis } = setup({ metalsDevApiKey: 'K' });
    await svc.setManualRates([{ purity: 'GOLD_22K' as any, ratePer10g: 131000 }]);
    await svc.syncFromMetalsDev('schedule');
    expect(rate(redis, 'rate:GOLD:GOLD_22K')).toMatchObject({ ratePerGram: 13100, source: 'manual' });
    expect(rate(redis, 'rate:GOLD:GOLD_24K').source).toBe('metals.dev');
  });

  it('enforces cooldown and the monthly budget without calling the API', async () => {
    const fetchMock = jest.fn().mockResolvedValue(ok({ ibja_gold: 14000, mcx_silver: 190 }));
    global.fetch = fetchMock as any;
    const { svc, redis } = setup({ metalsDevApiKey: 'K' });

    await svc.syncFromMetalsDev('manual');
    expect(await svc.syncFromMetalsDev('manual')).toMatchObject({ status: 'skipped', message: expect.stringContaining('20 minutes') });

    redis.store.delete('ratesync:metalsdev:cooldown');
    redis.store.set(`ratesync:metalsdev:calls:${istMonth()}`, String(METALSDEV_MONTHLY_BUDGET));
    expect(await svc.syncFromMetalsDev('schedule')).toMatchObject({ status: 'skipped', message: expect.stringContaining('budget') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports API errors without leaking the key and keeps existing rates', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ status: 'failure', error_message: 'Invalid API key SECRETKEY' }),
    }) as any;
    const { svc, redis } = setup({ metalsDevApiKey: 'SECRETKEY' });
    await redis.setJson('rate:GOLD:GOLD_24K', { ratePerGram: 14000, snappedAt: new Date().toISOString(), source: 'manual' });

    const res = await svc.syncFromMetalsDev('manual');
    expect(res.status).toBe('error');
    expect(res.message).not.toContain('SECRETKEY');
    expect(rate(redis, 'rate:GOLD:GOLD_24K').ratePerGram).toBe(14000);
    expect(JSON.parse(redis.store.get('ratesync:metalsdev:last-fetch')!)).toMatchObject({ ok: false });
  });
});
