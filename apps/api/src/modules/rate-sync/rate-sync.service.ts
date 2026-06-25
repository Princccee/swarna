import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { Metal, Purity } from '@svarna/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RateGateway, RateUpdatePayload } from './rate.gateway';
import { paginationMeta } from '../../common/dto/pagination.dto';
import { QueryRateHistoryDto } from './dto/query-rate-history.dto';

const RATE_TTL = 600; // 10 minutes
const RATE_KEY = (metal: string, purity: string) => `rate:${metal}:${purity}`;

/** Maps Metal+Purity to approximate base rate in INR/gram (used when feed is unavailable) */
const BASE_RATES: Partial<Record<string, number>> = {
  [`${Metal.GOLD}:${Purity.GOLD_24K}`]: 6500,
  [`${Metal.GOLD}:${Purity.GOLD_22K}`]: 5960,
  [`${Metal.GOLD}:${Purity.GOLD_18K}`]: 4875,
  [`${Metal.GOLD}:${Purity.GOLD_14K}`]: 3800,
  [`${Metal.SILVER}:${Purity.SILVER_999}`]: 95,
  [`${Metal.SILVER}:${Purity.SILVER_925}`]: 88,
  [`${Metal.PLATINUM}:${Purity.PLATINUM_950}`]: 3200,
};

@Injectable()
export class RateSyncService implements OnModuleInit {
  private readonly logger = new Logger(RateSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly gateway: RateGateway,
    private readonly config: ConfigService,
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
          // No historical data — write base rate
          const base = BASE_RATES[`${metal}:${purity}`];
          if (base) await this.writeRate(metal as Metal, purity as Purity, base, 'base');
        }
      }
    }

    this.logger.log('Redis seeded from DB snapshots');
  }

  /** Cron: fetch bullion rates every 5 minutes */
  @Cron('*/5 * * * *')
  async fetchAndSyncRates() {
    const feedUrl = this.config.get<string>('app.bullionFeed.url');
    const apiKey = this.config.get<string>('app.bullionFeed.apiKey');

    if (!feedUrl || feedUrl.includes('your-bullion-api')) {
      await this.useMockRates();
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers['X-API-Key'] = apiKey;

      const res = await fetch(feedUrl, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Feed returned ${res.status}`);

      const body = await res.json();
      await this.parseFeedAndWrite(body, feedUrl);
    } catch (err) {
      this.logger.warn(`Bullion feed unreachable (${(err as Error).message}), keeping last known rates`);
      // Refresh TTL on existing Redis keys so they don't expire
      await this.refreshTtls();
    }
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

  private async parseFeedAndWrite(body: unknown, source: string) {
    // Generic feed parser — extend this for specific providers
    if (typeof body !== 'object' || body === null) return;
    const data = body as Record<string, unknown>;
    const snappedAt = new Date().toISOString();

    // Expected format: { GOLD_24K: 6500.00, GOLD_22K: 5960.00, ... }
    const mapping: Array<[string, Metal, Purity]> = [
      ['GOLD_24K', Metal.GOLD, Purity.GOLD_24K],
      ['GOLD_22K', Metal.GOLD, Purity.GOLD_22K],
      ['GOLD_18K', Metal.GOLD, Purity.GOLD_18K],
      ['GOLD_14K', Metal.GOLD, Purity.GOLD_14K],
      ['SILVER_999', Metal.SILVER, Purity.SILVER_999],
      ['SILVER_925', Metal.SILVER, Purity.SILVER_925],
      ['PLATINUM_950', Metal.PLATINUM, Purity.PLATINUM_950],
    ];

    for (const [field, metal, purity] of mapping) {
      const rate = parseFloat(String(data[field] ?? 0));
      if (rate > 0) await this.writeRate(metal, purity, rate, source, snappedAt);
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
