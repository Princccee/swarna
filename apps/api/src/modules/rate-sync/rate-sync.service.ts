import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { Metal, Purity } from '@svarna/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RateGateway, RateUpdatePayload } from './rate.gateway';
import { paginationMeta } from '../../common/dto/pagination.dto';
import { QueryRateHistoryDto } from './dto/query-rate-history.dto';
import {
  CachedRate, DEMO_SOURCES, TZ, computeShopRates, demoRatesAllowed, istMonth, maxChangePct,
  parseMetalsDevLatest, rateMaxAgeHours, rateUsability, secondsUntilIstMidnight,
} from './rate-math';

// Price cache. Long TTL: freshness is judged by `snappedAt`, not by key expiry, so a rate
// fetched on Saturday evening is still available (and flagged if too old) on Monday morning.
const RATE_TTL = 7 * 24 * 3600;
const RATE_KEY = (metal: string, purity: string) => `rate:${metal}:${purity}`;

// Internal bookkeeping. Must NOT use the `rate:` prefix — several modules read every
// `rate:*` key as a price.
const KEY_MANUAL_LOCK = (purity: string) => `ratesync:manual-lock:${purity}`;
const KEY_PENDING = 'ratesync:pending';
const KEY_LAST_FETCH = 'ratesync:metalsdev:last-fetch';
const KEY_QUOTA = (month: string) => `ratesync:metalsdev:calls:${month}`;
const KEY_COOLDOWN = 'ratesync:metalsdev:cooldown';

const METALSDEV_URL = 'https://api.metals.dev/v1/latest';
/** Free plan allows 100 requests/month; keep a margin for manual testing in the dashboard. */
export const METALSDEV_MONTHLY_BUDGET = 95;
/** Minimum gap between metals.dev calls, so restarts or repeated clicks can't drain the quota. */
const METALSDEV_COOLDOWN_S = 20 * 60;
export const METALSDEV_SCHEDULE_LABEL = '10:00, 13:00 and 17:30 IST, Monday–Saturday';

const GOLDAPI_LAST_FETCH_KEY = 'goldapi:last_fetch';
// Minimum gap between goldapi.io calls — keeps free-tier usage (~100 req/month) within budget
const GOLDAPI_MIN_INTERVAL_MS = 14 * 60 * 1000;
const GOLDAPI_BASE = 'https://www.goldapi.io/api';

const METAL_OF: Record<string, Metal> = {
  GOLD_24K: Metal.GOLD, GOLD_22K: Metal.GOLD, GOLD_18K: Metal.GOLD, GOLD_14K: Metal.GOLD,
  SILVER_999: Metal.SILVER, SILVER_925: Metal.SILVER, PLATINUM_950: Metal.PLATINUM,
};

/** Placeholder rates (INR/gram) for local development only — never used for billing in production. */
const BASE_RATES: Partial<Record<string, number>> = {
  [`${Metal.GOLD}:${Purity.GOLD_24K}`]: 6500,
  [`${Metal.GOLD}:${Purity.GOLD_22K}`]: 5960,
  [`${Metal.GOLD}:${Purity.GOLD_18K}`]: 4875,
  [`${Metal.GOLD}:${Purity.GOLD_14K}`]: 3800,
  [`${Metal.SILVER}:${Purity.SILVER_999}`]: 95,
  [`${Metal.SILVER}:${Purity.SILVER_925}`]: 88,
  [`${Metal.PLATINUM}:${Purity.PLATINUM_950}`]: 3200,
};

interface GoldApiResponse {
  metal: string;
  currency: string;
  price: number;
  price_gram_24k: number;
  price_gram_22k: number;
  price_gram_21k: number;
  price_gram_18k: number;
  price_gram_14k: number;
  error?: string;
}

interface RateSettings {
  metalsDevApiKey: string;
  goldApiKey: string;
  goldPremiumPer10g: number;
  silverPremiumPer10g: number;
  maxChangePct: number;
}

export interface PendingRates {
  rates: Record<string, number>;
  fetchedAt: string;
  changePct: number;
  previous: Record<string, number>;
}

export interface LastFetch {
  at: string;
  ok: boolean;
  trigger: string;
  message: string;
}

export type SyncResult =
  | { status: 'applied'; message: string; changePct: number }
  | { status: 'pending'; message: string; changePct: number }
  | { status: 'skipped'; message: string }
  | { status: 'error'; message: string };

@Injectable()
export class RateSyncService implements OnModuleInit {
  private readonly logger = new Logger(RateSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: RateGateway,
  ) {}

  get allowDemoRates(): boolean {
    return demoRatesAllowed();
  }

  get maxAgeHours(): number {
    return rateMaxAgeHours();
  }

  async onModuleInit() {
    await this.seedRedisFromDb();

    // If metals.dev is configured but we have no recent real rate (fresh deploy, long downtime),
    // fetch once now instead of waiting for the next scheduled slot. Cooldown protects the quota.
    const settings = await this.loadSettings();
    if (settings.metalsDevApiKey) {
      const gold = await this.redis.getJson<CachedRate>(RATE_KEY(Metal.GOLD, Purity.GOLD_24K));
      const fresh = gold && !DEMO_SOURCES.has(gold.source ?? '') &&
        Date.now() - new Date(gold.snappedAt).getTime() < 12 * 3_600_000;
      if (!fresh) {
        this.syncFromMetalsDev('startup').catch((e) => this.logger.error(`Startup rate fetch failed: ${e.message}`));
      }
    }
  }

  /** Seed Redis from the latest DB snapshots on startup */
  private async seedRedisFromDb() {
    const metals = Object.values(Metal);
    const purities = Object.values(Purity);

    for (const metal of metals) {
      for (const purity of purities) {
        if (METAL_OF[purity] !== metal) continue;
        // Entries cached before `source` was tracked are reloaded from the DB (which records the
        // source), so a placeholder rate can't pass as a real one.
        const existing = await this.redis.getJson<CachedRate>(RATE_KEY(metal, purity));
        if (existing?.source) continue;

        const snap = await this.prisma.rateSnapshot.findFirst({
          where: { metal, purity },
          orderBy: { snappedAt: 'desc' },
        });

        if (snap) {
          await this.redis.setJson(
            RATE_KEY(metal, purity),
            { ratePerGram: snap.ratePerGram.toNumber(), snappedAt: snap.snappedAt.toISOString(), source: snap.source ?? undefined },
            RATE_TTL,
          );
        } else if (this.allowDemoRates) {
          const base = BASE_RATES[`${metal}:${purity}`];
          if (base) await this.writeRate(metal as Metal, purity as Purity, base, 'base');
        }
      }
    }

    this.logger.log('Redis seeded from DB snapshots');
  }

  // ── Scheduling ─────────────────────────────────────────────────────────────

  /** metals.dev: three fetches per working day ≈ 78/month, inside the free 100. */
  @Cron('0 10,13 * * 1-6', { timeZone: TZ })
  async scheduledMetalsDevMidday() {
    await this.runScheduledMetalsDev();
  }

  @Cron('30 17 * * 1-6', { timeZone: TZ })
  async scheduledMetalsDevEvening() {
    await this.runScheduledMetalsDev();
  }

  private async runScheduledMetalsDev() {
    const { metalsDevApiKey } = await this.loadSettings();
    if (!metalsDevApiKey) return;
    const res = await this.syncFromMetalsDev('schedule');
    this.logger.log(`Scheduled metals.dev sync: ${res.status} — ${res.message}`);
  }

  /** Every 15 minutes: goldapi.io (if that is the configured provider) or demo jitter in development. */
  @Cron('*/15 * * * *')
  async fetchAndSyncRates() {
    const settings = await this.loadSettings();
    if (settings.metalsDevApiKey) return; // metals.dev runs on its own schedule

    if (!settings.goldApiKey) {
      if (this.allowDemoRates) await this.useMockRates();
      return;
    }

    // Throttle actual goldapi.io HTTP calls to respect the free-tier monthly quota
    const lastFetch = await this.redis.get(GOLDAPI_LAST_FETCH_KEY);
    if (lastFetch) {
      const elapsed = Date.now() - parseInt(lastFetch, 10);
      if (elapsed < GOLDAPI_MIN_INTERVAL_MS) {
        this.logger.debug(
          `goldapi.io: skipping — ${Math.round((GOLDAPI_MIN_INTERVAL_MS - elapsed) / 1000)}s until next allowed call`,
        );
        return;
      }
    }

    try {
      const [gold, silver] = await Promise.all([
        this.fetchGoldApi('XAU', settings.goldApiKey),
        this.fetchGoldApi('XAG', settings.goldApiKey),
      ]);

      const snappedAt = new Date().toISOString();

      if (gold && !gold.error) {
        await this.writeRate(Metal.GOLD, Purity.GOLD_24K, gold.price_gram_24k, 'goldapi.io', snappedAt);
        await this.writeRate(Metal.GOLD, Purity.GOLD_22K, gold.price_gram_22k, 'goldapi.io', snappedAt);
        await this.writeRate(Metal.GOLD, Purity.GOLD_18K, gold.price_gram_18k, 'goldapi.io', snappedAt);
        await this.writeRate(Metal.GOLD, Purity.GOLD_14K, gold.price_gram_14k, 'goldapi.io', snappedAt);
        this.logger.log(`goldapi.io: Gold 24K = ₹${gold.price_gram_24k}/g`);
      }

      if (silver && !silver.error) {
        // XAG price_gram_24k = fine silver (999) per gram; 925 = sterling silver
        const silver999 = silver.price_gram_24k;
        const silver925 = parseFloat((silver999 * 0.925).toFixed(4));
        await this.writeRate(Metal.SILVER, Purity.SILVER_999, silver999, 'goldapi.io', snappedAt);
        await this.writeRate(Metal.SILVER, Purity.SILVER_925, silver925, 'goldapi.io', snappedAt);
        this.logger.log(`goldapi.io: Silver 999 = ₹${silver999}/g`);
      }

      await this.redis.set(GOLDAPI_LAST_FETCH_KEY, String(Date.now()), 1800);
    } catch (err) {
      this.logger.warn(`goldapi.io fetch failed (${(err as Error).message}), keeping last known rates`);
    }
  }

  // ── metals.dev (IBJA/MCX benchmark + Patna premium) ─────────────────────────

  /**
   * Fetches benchmark 999 rates from metals.dev, adds the shop's local premium and derives
   * every gold/silver purity. Applies them unless the move vs. current rates exceeds the
   * owner's threshold, in which case they wait for approval.
   */
  async syncFromMetalsDev(trigger: 'schedule' | 'startup' | 'manual'): Promise<SyncResult> {
    const settings = await this.loadSettings();
    if (!settings.metalsDevApiKey) {
      return { status: 'error', message: 'metals.dev API key is not set (Settings → Live rates).' };
    }

    const month = istMonth();
    const used = Number(await this.redis.get(KEY_QUOTA(month))) || 0;
    if (used >= METALSDEV_MONTHLY_BUDGET) {
      const r: SyncResult = { status: 'skipped', message: `Monthly metals.dev budget used (${used}/${METALSDEV_MONTHLY_BUDGET}). Enter rates manually until next month.` };
      await this.recordLastFetch(trigger, false, r.message);
      return r;
    }

    if (!(await this.redis.setIfAbsent(KEY_COOLDOWN, String(Date.now()), METALSDEV_COOLDOWN_S))) {
      return { status: 'skipped', message: 'Rates were fetched less than 20 minutes ago. Try again shortly.' };
    }
    await this.redis.incrWithTtl(KEY_QUOTA(month), 40 * 24 * 3600);

    try {
      const url = `${METALSDEV_URL}?api_key=${encodeURIComponent(settings.metalsDevApiKey)}&currency=INR&unit=g`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
      const body: any = await res.json().catch(() => null);
      if (!res.ok && body?.status !== 'failure') throw new Error(`metals.dev HTTP ${res.status}`);

      const base = parseMetalsDevLatest(body);
      const next = computeShopRates(base, {
        goldPer10g: settings.goldPremiumPer10g,
        silverPer10g: settings.silverPremiumPer10g,
      });

      const previous = await this.currentRealRates();
      const changePct = maxChangePct(next, previous);
      const summary =
        `24K ₹${Math.round(next.GOLD_24K * 10).toLocaleString('en-IN')}/10g, ` +
        `Silver ₹${Math.round(next.SILVER_999 * 10).toLocaleString('en-IN')}/10g ` +
        `(${base.goldSource} + ₹${settings.goldPremiumPer10g}/10g premium)`;

      if (Object.keys(previous).length > 0 && changePct > settings.maxChangePct) {
        const pending: PendingRates = { rates: next, fetchedAt: new Date().toISOString(), changePct, previous };
        await this.redis.setJson(KEY_PENDING, pending, secondsUntilIstMidnight());
        const msg = `Held for approval: rates moved ${changePct.toFixed(1)}% (limit ${settings.maxChangePct}%). ${summary}`;
        await this.recordLastFetch(trigger, true, msg);
        this.logger.warn(msg);
        return { status: 'pending', message: msg, changePct };
      }

      const applied = await this.applyRates(next, 'metals.dev', { respectManualLocks: true });
      await this.redis.del(KEY_PENDING);
      const msg = `Updated ${applied.length} rates: ${summary}`;
      await this.recordLastFetch(trigger, true, msg);
      return { status: 'applied', message: msg, changePct };
    } catch (err) {
      const msg = (err as Error).message.replace(settings.metalsDevApiKey, '***');
      await this.recordLastFetch(trigger, false, msg);
      this.logger.error(`metals.dev sync failed: ${msg}`);
      return { status: 'error', message: msg };
    }
  }

  async approvePending(): Promise<{ applied: string[] }> {
    const pending = await this.redis.getJson<PendingRates>(KEY_PENDING);
    if (!pending) throw new BadRequestException('No fetched rates are waiting for approval.');
    const applied = await this.applyRates(pending.rates, 'metals.dev', { respectManualLocks: false });
    await this.redis.del(KEY_PENDING);
    return { applied };
  }

  async rejectPending(): Promise<void> {
    await this.redis.del(KEY_PENDING);
  }

  /**
   * Owner-entered rates (per 10 g). They win over scheduled fetches for the rest of the day.
   */
  async setManualRates(entries: Array<{ purity: Purity; ratePer10g: number }>): Promise<{ applied: string[] }> {
    const snappedAt = new Date().toISOString();
    const lockTtl = secondsUntilIstMidnight();
    for (const e of entries) {
      const metal = METAL_OF[e.purity];
      if (!metal) throw new BadRequestException(`Unknown purity ${e.purity}`);
      await this.writeRate(metal, e.purity, e.ratePer10g / 10, 'manual', snappedAt);
      await this.redis.set(KEY_MANUAL_LOCK(e.purity), '1', lockTtl);
    }
    return { applied: entries.map((e) => e.purity) };
  }

  async getStatus() {
    const settings = await this.loadSettings();
    const now = new Date();
    const month = istMonth(now);
    const provider = settings.metalsDevApiKey ? 'metals.dev'
      : settings.goldApiKey ? 'goldapi.io'
      : this.allowDemoRates ? 'demo' : 'manual';

    const rates = await Promise.all(Object.entries(METAL_OF).map(async ([purity, metal]) => {
      const cached = await this.redis.getJson<CachedRate>(RATE_KEY(metal, purity));
      const usable = rateUsability(cached, { now, allowDemo: this.allowDemoRates, maxAgeHours: this.maxAgeHours, label: purity.replace('_', ' ') });
      return {
        metal, purity,
        ratePerGram: cached?.ratePerGram ?? null,
        snappedAt: cached?.snappedAt ?? null,
        source: cached?.source ?? null,
        manualToday: !!(await this.redis.get(KEY_MANUAL_LOCK(purity))),
        usable: usable.ok,
        problem: usable.ok ? null : usable.message,
      };
    }));

    return {
      provider,
      allowDemoRates: this.allowDemoRates,
      maxAgeHours: this.maxAgeHours,
      schedule: settings.metalsDevApiKey ? METALSDEV_SCHEDULE_LABEL : null,
      premiums: { goldPer10g: settings.goldPremiumPer10g, silverPer10g: settings.silverPremiumPer10g },
      maxChangePct: settings.maxChangePct,
      quota: settings.metalsDevApiKey
        ? { month, used: Number(await this.redis.get(KEY_QUOTA(month))) || 0, budget: METALSDEV_MONTHLY_BUDGET }
        : null,
      lastFetch: await this.redis.getJson<LastFetch>(KEY_LAST_FETCH),
      pending: await this.redis.getJson<PendingRates>(KEY_PENDING),
      rates,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async loadSettings(): Promise<RateSettings> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: ['metalsDevApiKey', 'goldApiKey', 'goldPremiumPer10g', 'silverPremiumPer10g', 'rateMaxChangePct'] } },
    });
    const s = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value?.trim() ?? '']));
    const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
    return {
      metalsDevApiKey: s.metalsDevApiKey ?? '',
      goldApiKey: s.goldApiKey ?? '',
      goldPremiumPer10g: num(s.goldPremiumPer10g, 0),
      silverPremiumPer10g: num(s.silverPremiumPer10g, 0),
      maxChangePct: num(s.rateMaxChangePct, 3),
    };
  }

  /** Current non-demo rates (per gram) keyed by purity, for the jump check. */
  private async currentRealRates(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const [purity, metal] of Object.entries(METAL_OF)) {
      const cached = await this.redis.getJson<CachedRate>(RATE_KEY(metal, purity));
      if (cached && !DEMO_SOURCES.has(cached.source ?? '')) out[purity] = cached.ratePerGram;
    }
    return out;
  }

  private async applyRates(
    rates: Record<string, number>,
    source: string,
    opts: { respectManualLocks: boolean },
  ): Promise<string[]> {
    const snappedAt = new Date().toISOString();
    const applied: string[] = [];
    for (const [purity, ratePerGram] of Object.entries(rates)) {
      const metal = METAL_OF[purity];
      if (!metal) continue;
      if (opts.respectManualLocks && (await this.redis.get(KEY_MANUAL_LOCK(purity)))) continue;
      if (!opts.respectManualLocks) await this.redis.del(KEY_MANUAL_LOCK(purity));
      await this.writeRate(metal, purity as Purity, ratePerGram, source, snappedAt);
      applied.push(purity);
    }
    return applied;
  }

  private async recordLastFetch(trigger: string, ok: boolean, message: string) {
    const entry: LastFetch = { at: new Date().toISOString(), ok, trigger, message };
    await this.redis.setJson(KEY_LAST_FETCH, entry, 40 * 24 * 3600);
  }

  private async fetchGoldApi(symbol: 'XAU' | 'XAG', apiKey: string): Promise<GoldApiResponse | null> {
    const res = await fetch(`${GOLDAPI_BASE}/${symbol}/INR`, {
      headers: { 'x-access-token': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      throw new Error(`${symbol}/INR returned ${res.status}: ${text}`);
    }

    return res.json() as Promise<GoldApiResponse>;
  }

  private async useMockRates() {
    const snappedAt = new Date().toISOString();
    for (const [key, base] of Object.entries(BASE_RATES)) {
      if (!base) continue;
      const [metal, purity] = key.split(':') as [Metal, Purity];
      // Never overwrite a real (manual/provider) rate with demo data
      const existing = await this.redis.getJson<CachedRate>(RATE_KEY(metal, purity));
      if (existing && !DEMO_SOURCES.has(existing.source ?? '')) continue;
      // ±0.3% jitter for realistic ticker movement
      const jitter = 1 + (Math.random() * 0.006 - 0.003);
      await this.writeRate(metal, purity, parseFloat((base * jitter).toFixed(4)), 'mock', snappedAt);
    }
  }

  private async writeRate(
    metal: Metal,
    purity: Purity,
    ratePerGram: number,
    source: string,
    snappedAt = new Date().toISOString(),
  ) {
    const payload: RateUpdatePayload = { metal, purity, ratePerGram, snappedAt, source };
    await this.redis.setJson(RATE_KEY(metal, purity), { ratePerGram, snappedAt, source }, RATE_TTL);

    await this.prisma.rateSnapshot.create({
      data: {
        metal,
        purity,
        ratePerGram: new Prisma.Decimal(ratePerGram),
        source,
        snappedAt: new Date(snappedAt),
      },
    });

    this.gateway.broadcastRateUpdate(payload);
  }

  async getCurrentRates(): Promise<RateUpdatePayload[]> {
    const keys = await this.redis.keys('rate:*');
    const results: RateUpdatePayload[] = [];
    for (const key of keys) {
      const val = await this.redis.getJson<{ ratePerGram: number; snappedAt: string; source?: string }>(key);
      if (val) {
        const [, metal, purity] = key.split(':');
        results.push({ metal, purity, ...val });
      }
    }
    return results;
  }

  async getLatestRate(metal: Metal, purity: Purity): Promise<{ ratePerGram: number; snappedAt: string } | null> {
    return this.redis.getJson<{ ratePerGram: number; snappedAt: string }>(RATE_KEY(metal, purity));
  }

  async getRateHistory(query: QueryRateHistoryDto) {
    const { page = 1, limit = 20, metal, purity, from, to } = query;
    const where: Prisma.RateSnapshotWhereInput = {};
    if (metal) where.metal = metal;
    if (purity) where.purity = purity;
    if (from || to) {
      where.snappedAt = {};
      if (from) where.snappedAt.gte = new Date(from);
      if (to) where.snappedAt.lte = new Date(to);
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.rateSnapshot.findMany({
        where,
        orderBy: { snappedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.rateSnapshot.count({ where }),
    ]);

    return { rows, meta: paginationMeta(page, limit, total) };
  }
}
