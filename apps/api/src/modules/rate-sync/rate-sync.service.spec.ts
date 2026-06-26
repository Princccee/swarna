import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Metal, Purity } from '@svarna/shared-types';
import { RateSyncService } from './rate-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RateGateway } from './rate.gateway';
import { Prisma } from '@prisma/client';

const mockSnapshot = {
  id: 'snap-1',
  metal: Metal.GOLD,
  purity: Purity.GOLD_22K,
  ratePerGram: new Prisma.Decimal('5960.0000'),
  currency: 'INR',
  source: 'mock',
  snappedAt: new Date(),
};

describe('RateSyncService', () => {
  let service: RateSyncService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let redis: jest.Mocked<RedisService>;
  let gateway: jest.Mocked<RateGateway>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateSyncService,
        {
          provide: PrismaService,
          useValue: {
            rateSnapshot: {
              findFirst: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              count: jest.fn(),
            },
            $transaction: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            setJson: jest.fn(),
            getJson: jest.fn(),
            keys: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: RateGateway,
          useValue: { broadcastRateUpdate: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
      ],
    }).compile();

    service = module.get<RateSyncService>(RateSyncService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    gateway = module.get(RateGateway);

    // Prevent cron from firing during tests
    jest.spyOn(service, 'fetchAndSyncRates').mockResolvedValue(undefined);
  });

  describe('getCurrentRates', () => {
    it('returns empty array when Redis has no rate keys', async () => {
      redis.keys.mockResolvedValue([]);
      const result = await service.getCurrentRates();
      expect(result).toEqual([]);
    });

    it('returns parsed rates from Redis', async () => {
      redis.keys.mockResolvedValue(['rate:GOLD:GOLD_22K']);
      redis.getJson.mockResolvedValue({ ratePerGram: 5960, snappedAt: '2026-06-25T00:00:00Z' });

      const result = await service.getCurrentRates();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ metal: 'GOLD', purity: 'GOLD_22K', ratePerGram: 5960 });
    });
  });

  describe('getLatestRate', () => {
    it('returns null when not cached', async () => {
      redis.getJson.mockResolvedValue(null);
      const result = await service.getLatestRate(Metal.GOLD, Purity.GOLD_22K);
      expect(result).toBeNull();
    });

    it('returns rate object from Redis', async () => {
      redis.getJson.mockResolvedValue({ ratePerGram: 5960, snappedAt: '2026-06-25T00:00:00Z' });
      const result = await service.getLatestRate(Metal.GOLD, Purity.GOLD_22K);
      expect(result?.ratePerGram).toBe(5960);
    });
  });

  describe('getRateHistory', () => {
    it('returns paginated snapshots', async () => {
      prisma.$transaction.mockResolvedValue([[mockSnapshot], 1]);
      const result = await service.getRateHistory({ page: 1, limit: 20 });
      expect(result.rows).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
