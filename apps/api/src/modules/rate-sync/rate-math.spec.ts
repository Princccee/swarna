import {
  computeShopRates, demoRatesAllowed, maxChangePct, parseMetalsDevLatest,
  rateMaxAgeHours, rateUsability, secondsUntilIstMidnight, istDate,
} from './rate-math';

// Shape documented at https://metals.dev/docs (latest endpoint), here with currency=INR&unit=g
const metalsDevBody = (metals: Record<string, number>, extra: Record<string, unknown> = {}) => ({
  status: 'success', currency: 'INR', unit: 'g', metals, currencies: {}, ...extra,
});

describe('parseMetalsDevLatest', () => {
  it('prefers IBJA gold and MCX silver', () => {
    const r = parseMetalsDevLatest(metalsDevBody({ gold: 13000, ibja_gold: 14396, mcx_gold: 14420, mcx_silver: 191.3 }));
    expect(r).toEqual({ gold999PerGram: 14396, silver999PerGram: 191.3, goldSource: 'ibja_gold', silverSource: 'mcx_silver' });
  });

  it('falls back to MCX gold when IBJA is absent', () => {
    expect(parseMetalsDevLatest(metalsDevBody({ mcx_gold: 14420, mcx_silver: 191 })).goldSource).toBe('mcx_gold');
  });

  it('rejects failures, wrong units and implausible values', () => {
    expect(() => parseMetalsDevLatest({ status: 'failure', error_message: 'Invalid API key' })).toThrow('Invalid API key');
    expect(() => parseMetalsDevLatest(metalsDevBody({ ibja_gold: 14396, mcx_silver: 191 }, { unit: 'toz' }))).toThrow('expected INR/g');
    expect(() => parseMetalsDevLatest(metalsDevBody({ ibja_gold: 447000, mcx_silver: 191 }))).toThrow('Implausible gold');
    expect(() => parseMetalsDevLatest(metalsDevBody({ ibja_gold: 14396, mcx_silver: 191000 }))).toThrow('Implausible silver');
    expect(() => parseMetalsDevLatest(metalsDevBody({ ibja_gold: 14396 }))).toThrow('mcx_silver');
  });
});

describe('computeShopRates', () => {
  it('adds the per-10g premium to 999 and scales purities by fineness', () => {
    const r = computeShopRates({ gold999PerGram: 14000, silver999PerGram: 190 }, { goldPer10g: 500, silverPer10g: 20 });
    expect(r.GOLD_24K).toBe(14050);            // 14000 + 500/10
    expect(r.GOLD_22K).toBeCloseTo(12869.8);   // 14050 × 0.916
    expect(r.GOLD_18K).toBeCloseTo(10537.5);
    expect(r.GOLD_14K).toBeCloseTo(8219.25);
    expect(r.SILVER_999).toBe(192);            // 190 + 20/10
    expect(r.SILVER_925).toBeCloseTo(177.6);
    expect(r).not.toHaveProperty('PLATINUM_950');
  });
});

describe('maxChangePct', () => {
  it('reports the largest move among purities present in both', () => {
    expect(maxChangePct({ GOLD_24K: 103, SILVER_999: 100 }, { GOLD_24K: 100, SILVER_999: 95 })).toBeCloseTo(5.263, 2);
    expect(maxChangePct({ GOLD_24K: 103 }, {})).toBe(0);
  });
});

describe('rateUsability', () => {
  const now = new Date('2026-11-11T10:00:00Z');
  const opts = { now, allowDemo: false, maxAgeHours: 48, label: 'GOLD 22K' };

  it('accepts a fresh real rate', () => {
    expect(rateUsability({ ratePerGram: 13000, snappedAt: '2026-11-11T05:00:00Z', source: 'metals.dev' }, opts)).toEqual({ ok: true });
  });
  it('rejects missing, demo and stale rates with a helpful message', () => {
    expect(rateUsability(null, opts)).toMatchObject({ ok: false, reason: 'missing' });
    expect(rateUsability({ ratePerGram: 5960, snappedAt: '2026-11-11T09:00:00Z', source: 'mock' }, opts))
      .toMatchObject({ ok: false, reason: 'demo' });
    const stale = rateUsability({ ratePerGram: 13000, snappedAt: '2026-11-08T09:00:00Z', source: 'manual' }, opts);
    expect(stale).toMatchObject({ ok: false, reason: 'stale' });
    expect(!stale.ok && stale.message).toContain('73 hours old');
  });
  it('allows demo rates when permitted', () => {
    expect(rateUsability({ ratePerGram: 5960, snappedAt: '2026-11-11T09:00:00Z', source: 'mock' }, { ...opts, allowDemo: true }).ok).toBe(true);
  });
});

describe('env helpers', () => {
  it('demo rates default off in production, on elsewhere, overridable', () => {
    expect(demoRatesAllowed({ NODE_ENV: 'production' } as any)).toBe(false);
    expect(demoRatesAllowed({ NODE_ENV: 'development' } as any)).toBe(true);
    expect(demoRatesAllowed({ NODE_ENV: 'production', ALLOW_DEMO_RATES: 'true' } as any)).toBe(true);
    expect(demoRatesAllowed({ NODE_ENV: 'development', ALLOW_DEMO_RATES: 'false' } as any)).toBe(false);
  });
  it('max age defaults to 48h', () => {
    expect(rateMaxAgeHours({} as any)).toBe(48);
    expect(rateMaxAgeHours({ RATE_MAX_AGE_HOURS: '30' } as any)).toBe(30);
  });
});

describe('IST date helpers', () => {
  it('computes seconds to IST midnight and IST dates across the UTC boundary', () => {
    // 2026-11-11 23:00 IST = 17:30 UTC → 1 hour to midnight
    expect(secondsUntilIstMidnight(new Date('2026-11-11T17:30:00Z'))).toBe(3600);
    // 2026-11-11 19:00 UTC is already 12 Nov 00:30 IST
    expect(istDate(new Date('2026-11-11T19:00:00Z'))).toBe('2026-11-12');
  });
});
