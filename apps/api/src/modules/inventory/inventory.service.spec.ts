import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Purity } from '@svarna/shared-types';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { S3Service } from './s3.service';
import { StockMovementType } from './dto/stock-movement.dto';
import { Prisma } from '@prisma/client';

const mockCategory = {
  id: 'cat-1', name: 'Ring', slug: 'ring', visible: true, sortOrder: 0,
  createdAt: new Date(), updatedAt: new Date(),
};

const mockItem = {
  id: 'item-1', sku: 'RING-202607-0001', name: 'Gold Ring', description: null,
  categoryId: 'cat-1', purity: Purity.GOLD_22K,
  grossWeightG: new Prisma.Decimal('5.000'), netWeightG: new Prisma.Decimal('4.800'),
  stoneWeightG: new Prisma.Decimal('0'), huid: null, hallmarkCertUrl: null,
  makingPct: new Prisma.Decimal('12'), makingPerGram: new Prisma.Decimal('0'),
  stoneValue: new Prisma.Decimal('0'), stockQty: 5,
  imageUrls: [], active: true, catalogueVisible: false, branchId: null,
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
};

describe('InventoryService', () => {
  let service: InventoryService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let redis: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: PrismaService,
          useValue: {
            category: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), count: jest.fn() },
            item: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
            stockMovement: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
            huidLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
            invoiceLine: { count: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        { provide: RedisService, useValue: { getJson: jest.fn(), get: jest.fn(), set: jest.fn() } },
        { provide: S3Service, useValue: { uploadFile: jest.fn(), deleteFile: jest.fn() } },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
  });

  describe('createCategory', () => {
    it('creates a category with auto-generated slug', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(mockCategory);
      const result = await service.createCategory({ name: 'Ring' });
      expect(prisma.category.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: 'ring' }) }),
      );
      expect(result).toEqual(mockCategory);
    });

    it('throws ConflictException when slug already exists', async () => {
      prisma.category.findUnique.mockResolvedValue(mockCategory);
      await expect(service.createCategory({ name: 'Ring' })).rejects.toThrow(ConflictException);
    });
  });

  describe('createItem', () => {
    it('creates item with auto-generated SKU', async () => {
      prisma.category.findUnique.mockResolvedValue(mockCategory);
      prisma.item.findFirst.mockResolvedValue(null); // huid check returns null
      prisma.item.findUnique.mockResolvedValue(null); // sku check
      prisma.item.count.mockResolvedValue(0);
      prisma.item.create.mockResolvedValue(mockItem);

      const dto = {
        categoryId: 'cat-1', name: 'Gold Ring', purity: Purity.GOLD_22K,
        grossWeightG: '5.000', netWeightG: '4.800',
      };
      const result = await service.createItem(dto);
      expect(result).toEqual(mockItem);
    });

    it('throws ConflictException when HUID already exists', async () => {
      prisma.category.findUnique.mockResolvedValue(mockCategory);
      prisma.item.findFirst.mockResolvedValue({ ...mockItem, id: 'other-item' } as typeof mockItem);

      await expect(service.createItem({
        categoryId: 'cat-1', name: 'Ring', purity: Purity.GOLD_22K,
        grossWeightG: '5', netWeightG: '4', huid: 'ABC123',
      })).rejects.toThrow(ConflictException);
    });
  });

  describe('createStockMovement', () => {
    it('creates an IN movement and increments stock', async () => {
      prisma.item.findFirst.mockResolvedValue(mockItem);
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(prisma));
      prisma.stockMovement.create.mockResolvedValue({ id: 'mv-1', itemId: 'item-1', type: 'IN', qty: 2, reason: null, refId: null, createdAt: new Date() });
      prisma.item.update.mockResolvedValue({ ...mockItem, stockQty: 7 });

      const result = await service.createStockMovement('item-1', { type: StockMovementType.IN, qty: 2 });
      expect(prisma.item.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ stockQty: 7 }),
      }));
    });

    it('throws BadRequestException when stock goes negative', async () => {
      prisma.item.findFirst.mockResolvedValue({ ...mockItem, stockQty: 2 });
      await expect(
        service.createStockMovement('item-1', { type: StockMovementType.OUT, qty: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown item', async () => {
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(
        service.createStockMovement('bad-id', { type: StockMovementType.IN, qty: 1 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getValuation', () => {
    it('returns null valuation when rate is not cached', async () => {
      prisma.item.findFirst.mockResolvedValue(mockItem);
      redis.getJson.mockResolvedValue(null);

      const result = await service.getValuation('item-1');
      expect(result.valuation).toBeNull();
    });

    it('computes valuation from cached rate', async () => {
      prisma.item.findFirst.mockResolvedValue(mockItem);
      redis.getJson.mockResolvedValue({ ratePerGram: 5960, snappedAt: new Date().toISOString() });

      const result = await service.getValuation('item-1');
      expect(result.valuation).not.toBeNull();
      expect(result.valuation!.metalValue).toBeCloseTo(4.8 * 5960, 0);
    });
  });
});
