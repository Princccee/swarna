import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { Metal, Purity } from '@svarna/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RateGateway, RateUpdatePayload } from './rate.gateway';
import { paginationMeta } from '../../common/dto/pagination.dto';
import { QueryRateHistoryDto } from './dto/query-rate-history.dto';

const RATE_TTL = 900; // 15 minutes
const RATE_KEY = (metal: string, purity: string) => `rate:${metal}:${purity}`;
const GOLDAPI_LAST_FETCH_KEY = 'goldapi:last_fetch';
// Minimum gap between goldapi.io calls — keeps free-tier usage (~100 req/month) within budget
const GOLDAPI_MIN_INTERVAL_MS = 14 * 60 * 1000;

const GOLDAPI_BASE = 'https://www.goldapi.io/api';

/** Fallback rates in INR/gram used when no live API key is configured */
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

@Injectable()
export class RateSyncService implements OnModuleInit {
  private readonly logger = new Logger(RateSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: RateGateway,
  ) {}

  async onModuleInit() {
    await this.seedRedisFromDb();
  }

  /** Seed Redis from the latest DB snapshots on startup */
  private async seedRedisFromDb() {
    const metals = Object.values(Metal);
    const purities = Object.values(Purity);

    for (const metal of metals) {
      for (const purity of purities) {
        const existing = await this.redis.get(RATE_KEY(metal, purity));
        if (existing) continue;

        const snap = await this.prisma.rateSnapshot.findFirst({
          where: { metal, purity },
          orderBy: { snappedAt: 'desc' },
        });

        if (snap) {
          await this.redis.setJson(
            RATE_KEY(metal, purity),
            { ratePerGram: snap.ratePerGram.toNumber(), snappedAt: snap.snappedAt.toISOString() },
            RATE_TTL,
          );
        } else {
          const base = BASE_RATES[`${metal}:${purity}`];
          if (base) await this.writeRate(metal as Metal, purity as Purity, base, 'base');
        }
      }
    }

    this.logger.log('Redis seeded from DB snapshots');
  }

  /** Cron: sync rates every 15 minutes */
  @Cron('*/15 * * * *')
  async fetchAndSyncRates() {
    const apiKeyRow = await this.prisma.setting.findUnique({ where: { key: 'goldApiKey' } });
    const apiKey = apiKeyRow?.value?.trim();

    if (!apiKey) {
      await this.useMockRates();
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
        this.fetchGoldApi('XAU', apiKey),
        this.fetchGoldApi('XAG', apiKey),
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

      // Platinum not available on goldapi.io free tier — just refresh the existing TTL
      await this.refreshSingleTtl(Metal.PLATINUM, Purity.PLATINUM_950);

      await this.redis.set(GOLDAPI_LAST_FETCH_KEY, String(Date.now()), RATE_TTL * 2);
    } catch (err) {
      this.logger.warn(`goldapi.io fetch failed (${(err as Error).message}), keeping last known rates`);
      await this.refreshTtls();
    }
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
    const payload: RateUpdatePayload = { metal, purity, ratePerGram, snappedAt };
    await this.redis.setJson(RATE_KEY(metal, purity), { ratePerGram, snappedAt }, RATE_TTL);

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

  private async refreshSingleTtl(metal: Metal, purity: Purity) {
    const key = RATE_KEY(metal, purity);
    const val = await this.redis.get(key);
    if (val) await this.redis.set(key, val, RATE_TTL);
  }

  private async refreshTtls() {
    const keys = await this.redis.keys('rate:*');
    for (const key of keys) {
      const val = await this.redis.get(key);
      if (val) await this.redis.set(key, val, RATE_TTL);
    }
  }

  async getCurrentRates(): Promise<RateUpdatePayload[]> {
    const keys = await this.redis.keys('rate:*');
    const results: RateUpdatePayload[] = [];
    for (const key of keys) {
      const val = await this.redis.getJson<{ ratePerGram: number; snappedAt: string }>(key);
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
