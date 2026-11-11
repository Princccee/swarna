/**
 * Pure rate calculations, kept free of Nest/DB so they are easy to test.
 *
 * All rates are stored internally as INR per gram (billing multiplies by net weight in grams).
 * Owner-facing inputs (premiums, manual rates) are per 10 g, the Indian retail convention.
 */

export const TZ = 'Asia/Kolkata';

/** Sources that are placeholders, never real market rates. */
export const DEMO_SOURCES = new Set(['mock', 'base']);

/** Fineness relative to 24K/999 used to derive lower purities from the base rate. */
export const GOLD_FINENESS: Record<string, number> = {
  GOLD_24K: 1,
  GOLD_22K: 0.916,
  GOLD_18K: 0.75,
  GOLD_14K: 0.585,
};
export const SILVER_FINENESS: Record<string, number> = {
  SILVER_999: 1,
  SILVER_925: 0.925,
};

export interface CachedRate {
  ratePerGram: number;
  snappedAt: string;
  source?: string;
}

export interface BaseRates {
  /** 999 gold, INR per gram (e.g. IBJA) */
  gold999PerGram: number;
  /** 999 silver, INR per gram (e.g. MCX) */
  silver999PerGram: number;
}

export interface Premiums {
  goldPer10g: number;
  silverPer10g: number;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Local (Patna) shop rates for every gold/silver purity from benchmark 999 rates.
 * The premium is added to the 999 rate first, then lower purities scale by fineness,
 * so a 22K item carries 91.6% of the premium — the same way the metal content scales.
 */
export function computeShopRates(base: BaseRates, premiums: Premiums): Record<string, number> {
  const gold24 = base.gold999PerGram + premiums.goldPer10g / 10;
  const silver999 = base.silver999PerGram + premiums.silverPer10g / 10;
  const out: Record<string, number> = {};
  for (const [purity, f] of Object.entries(GOLD_FINENESS)) out[purity] = round4(gold24 * f);
  for (const [purity, f] of Object.entries(SILVER_FINENESS)) out[purity] = round4(silver999 * f);
  return out;
}

/**
 * Extracts INR/gram 999 benchmark rates from a metals.dev `/v1/latest?currency=INR&unit=g`
 * response. Gold prefers the IBJA rate (India's benchmark) and falls back to MCX;
 * silver uses MCX (metals.dev has no IBJA silver). Throws on anything unexpected.
 */
export function parseMetalsDevLatest(body: any): BaseRates & { goldSource: string; silverSource: string } {
  if (!body || body.status !== 'success') {
    const msg = body?.error_message ?? body?.message ?? body?.error_code ?? JSON.stringify(body)?.slice(0, 200);
    throw new Error(`metals.dev error: ${msg}`);
  }
  if (body.currency !== 'INR' || body.unit !== 'g') {
    throw new Error(`metals.dev returned ${body.currency}/${body.unit}, expected INR/g`);
  }
  const m = body.metals ?? {};
  const pick = (...keys: string[]): [number, string] | null => {
    for (const k of keys) {
      const v = Number(m[k]);
      if (Number.isFinite(v) && v > 0) return [v, k];
    }
    return null;
  };
  const gold = pick('ibja_gold', 'mcx_gold');
  const silver = pick('mcx_silver');
  if (!gold) throw new Error('metals.dev response has no ibja_gold or mcx_gold');
  if (!silver) throw new Error('metals.dev response has no mcx_silver');

  // Plausibility bounds (INR/gram) — catches unit mix-ups (e.g. per toz or per kg)
  if (gold[0] < 1000 || gold[0] > 100000) throw new Error(`Implausible gold rate ₹${gold[0]}/g from ${gold[1]}`);
  if (silver[0] < 10 || silver[0] > 2000) throw new Error(`Implausible silver rate ₹${silver[0]}/g from ${silver[1]}`);

  return { gold999PerGram: gold[0], silver999PerGram: silver[0], goldSource: gold[1], silverSource: silver[1] };
}

/** Largest absolute % change between new and previous rates across shared purities. */
export function maxChangePct(next: Record<string, number>, prev: Record<string, number | undefined>): number {
  let max = 0;
  for (const [purity, v] of Object.entries(next)) {
    const p = prev[purity];
    if (!p) continue;
    max = Math.max(max, Math.abs((v - p) / p) * 100);
  }
  return max;
}

export type RateUsability =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'demo' | 'stale'; message: string };

/** Whether a cached rate may be used to bill a customer. */
export function rateUsability(
  entry: Partial<CachedRate> | null | undefined,
  opts: { now: Date; allowDemo: boolean; maxAgeHours: number; label: string },
): RateUsability {
  if (!entry || entry.ratePerGram === undefined || entry.ratePerGram === null) {
    return { ok: false, reason: 'missing', message: `No rate set for ${opts.label}. Set today's rate on the Rates page.` };
  }
  if (!opts.allowDemo && entry.source && DEMO_SOURCES.has(entry.source)) {
    return { ok: false, reason: 'demo', message: `Only a demo rate exists for ${opts.label}. Set today's rate on the Rates page.` };
  }
  if (entry.snappedAt) {
    const ageH = (opts.now.getTime() - new Date(entry.snappedAt).getTime()) / 3_600_000;
    if (ageH > opts.maxAgeHours) {
      return {
        ok: false, reason: 'stale',
        message: `The ${opts.label} rate is ${Math.floor(ageH)} hours old. Update today's rate on the Rates page.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Demo (mock/base) rates are allowed outside production unless ALLOW_DEMO_RATES says otherwise.
 * In production they can never be used for billing.
 */
export function demoRatesAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.ALLOW_DEMO_RATES ?? '').trim();
  if (flag) return flag === 'true';
  return (env.NODE_ENV ?? 'development') !== 'production';
}

/** Rates older than this cannot be billed. Default 48h covers Sunday (no IBJA rate published). */
export function rateMaxAgeHours(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.RATE_MAX_AGE_HOURS);
  return Number.isFinite(v) && v > 0 ? v : 48;
}

/** YYYY-MM-DD in India time. */
export function istDate(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** YYYY-MM in India time. */
export function istMonth(d = new Date()): string {
  return istDate(d).slice(0, 7);
}

/** Seconds from `d` until the next midnight in India (IST is UTC+5:30, no DST). */
export function secondsUntilIstMidnight(d = new Date()): number {
  const istMs = d.getTime() + 5.5 * 3_600_000;
  const msIntoDay = ((istMs % 86_400_000) + 86_400_000) % 86_400_000;
  return Math.max(60, Math.ceil((86_400_000 - msIntoDay) / 1000));
}
