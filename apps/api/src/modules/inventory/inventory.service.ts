import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Purity, Metal } from '@svarna/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { S3Service } from './s3.service';
import { paginationMeta } from '../../common/dto/pagination.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { StockMovementDto, StockMovementType } from './dto/stock-movement.dto';
import { RegisterHuidDto } from './dto/register-huid.dto';

const PURITY_TO_METAL: Record<Purity, Metal> = {
  [Purity.GOLD_24K]: Metal.GOLD,
  [Purity.GOLD_22K]: Metal.GOLD,
  [Purity.GOLD_18K]: Metal.GOLD,
  [Purity.GOLD_14K]: Metal.GOLD,
  [Purity.SILVER_999]: Metal.SILVER,
  [Purity.SILVER_925]: Metal.SILVER,
  [Purity.PLATINUM_950]: Metal.PLATINUM,
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly s3: S3Service,
  ) {}

  // ─── Categories ────────────────────────────────────────────────────────────

  async findAllCategories() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: { where: { deletedAt: null, active: true } } } } },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const slug = dto.slug ?? this.toSlug(dto.name);
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) throw new ConflictException(`Category slug "${slug}" already exists`);

    return this.prisma.category.create({
      data: { name: dto.name, slug, visible: dto.visible ?? true, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.findCategoryOrFail(id);
    const raw = dto as Record<string, unknown>;
    if (raw['slug']) {
      const conflict = await this.prisma.category.findFirst({ where: { slug: String(raw['slug']), id: { not: id } } });
      if (conflict) throw new ConflictException(`Slug "${raw['slug']}" is already taken`);
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    await this.findCategoryOrFail(id);
    const activeItems = await this.prisma.item.count({ where: { categoryId: id, deletedAt: null } });
    if (activeItems > 0) throw new BadRequestException('Cannot delete category with active items');
    return this.prisma.category.delete({ where: { id } });
  }

  // ─── Items ─────────────────────────────────────────────────────────────────

  async findAllItems(query: QueryItemsDto) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const where: Prisma.ItemWhereInput = {};

    if (!query.includeDeleted) where.deletedAt = null;
    if (query.active !== undefined) where.active = query.active;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.purity) where.purity = query.purity;
    if (query.lowStock) where.stockQty = { lte: 2 };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { huid: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.item.findMany({
        where,
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.item.count({ where }),
    ]);

    return { items, meta: paginationMeta(page, limit, total) };
  }

  async findOneItem(id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        huidLogs: { orderBy: { loggedAt: 'desc' }, take: 5 },
        _count: { select: { stockMovements: true, invoiceLines: true } },
      },
    });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async createItem(dto: CreateItemDto) {
    await this.findCategoryOrFail(dto.categoryId);
    if (dto.huid) await this.assertHuidUnique(dto.huid);

    const sku = dto.sku ?? await this.generateSku(dto.categoryId);
    const skuConflict = await this.prisma.item.findUnique({ where: { sku } });
    if (skuConflict) throw new ConflictException(`SKU "${sku}" already exists`);

    return this.prisma.item.create({
      data: {
        categoryId: dto.categoryId,
        sku,
        name: dto.name,
        description: dto.description,
        purity: dto.purity,
        grossWeightG: new Prisma.Decimal(dto.grossWeightG),
        netWeightG: new Prisma.Decimal(dto.netWeightG),
        stoneWeightG: dto.stoneWeightG ? new Prisma.Decimal(dto.stoneWeightG) : new Prisma.Decimal(0),
        huid: dto.huid,
        makingPct: dto.makingPct ? new Prisma.Decimal(dto.makingPct) : new Prisma.Decimal(0),
        makingPerGram: dto.makingPerGram ? new Prisma.Decimal(dto.makingPerGram) : new Prisma.Decimal(0),
        stoneValue: dto.stoneValue ? new Prisma.Decimal(dto.stoneValue) : new Prisma.Decimal(0),
        active: dto.active ?? true,
        catalogueVisible: dto.catalogueVisible ?? false,
      },
    });
  }

  async updateItem(id: string, dto: UpdateItemDto) {
    await this.findItemOrFail(id);
    const raw = dto as Record<string, unknown>;
    if (raw['huid']) await this.assertHuidUnique(String(raw['huid']), id);
    if (raw['sku']) {
      const conflict = await this.prisma.item.findFirst({ where: { sku: String(raw['sku']), id: { not: id } } });
      if (conflict) throw new ConflictException(`SKU "${raw['sku']}" already exists`);
    }

    const data: Prisma.ItemUpdateInput = { ...dto };
    if (raw['grossWeightG']) data.grossWeightG = new Prisma.Decimal(String(raw['grossWeightG']));
    if (raw['netWeightG']) data.netWeightG = new Prisma.Decimal(String(raw['netWeightG']));
    if (raw['stoneWeightG']) data.stoneWeightG = new Prisma.Decimal(String(raw['stoneWeightG']));
    if (raw['makingPct']) data.makingPct = new Prisma.Decimal(String(raw['makingPct']));
    if (raw['makingPerGram']) data.makingPerGram = new Prisma.Decimal(String(raw['makingPerGram']));
    if (raw['stoneValue']) data.stoneValue = new Prisma.Decimal(String(raw['stoneValue']));

    return this.prisma.item.update({ where: { id }, data });
  }

  async deleteItem(id: string) {
    await this.findItemOrFail(id);
    const activeLines = await this.prisma.invoiceLine.count({ where: { itemId: id } });
    if (activeLines > 0) throw new BadRequestException('Cannot delete item with invoice history');
    return this.prisma.item.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ─── Images ────────────────────────────────────────────────────────────────

  async addImages(id: string, files: Express.Multer.File[]) {
    const item = await this.findItemOrFail(id);
    const urls = await Promise.all(
      files.map((f) => this.s3.uploadFile(f.buffer, f.mimetype, `items/${id}`, f.originalname)),
    );
    return this.prisma.item.update({
      where: { id },
      data: { imageUrls: [...item.imageUrls, ...urls] },
    });
  }

  async removeImage(id: string, index: number) {
    const item = await this.findItemOrFail(id);
    if (index < 0 || index >= item.imageUrls.length) throw new BadRequestException('Invalid image index');
    const url = item.imageUrls[index];
    await this.s3.deleteFile(url);
    const updated = item.imageUrls.filter((_, i) => i !== index);
    return this.prisma.item.update({ where: { id }, data: { imageUrls: updated } });
  }

  // ─── Stock ─────────────────────────────────────────────────────────────────

  async createStockMovement(itemId: string, dto: StockMovementDto) {
    const item = await this.findItemOrFail(itemId);

    let qtyDelta: number;
    if (dto.type === StockMovementType.IN) qtyDelta = dto.qty;
    else if (dto.type === StockMovementType.OUT) qtyDelta = -dto.qty;
    else qtyDelta = dto.qty - item.stockQty; // ADJUSTMENT sets absolute qty

    const newQty = item.stockQty + qtyDelta;
    if (newQty < 0) throw new BadRequestException(`Insufficient stock. Current: ${item.stockQty}`);

    return this.prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: { itemId, type: dto.type, qty: dto.qty, reason: dto.reason },
      });
      await tx.item.update({ where: { id: itemId }, data: { stockQty: newQty } });
      return movement;
    });
  }

  async findStockHistory(itemId: string, page = 1, limit = 20) {
    await this.findItemOrFail(itemId);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where: { itemId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where: { itemId } }),
    ]);
    return { rows, meta: paginationMeta(page, limit, total) };
  }

  // ─── HUID ──────────────────────────────────────────────────────────────────

  async registerHuid(itemId: string, dto: RegisterHuidDto) {
    const item = await this.findItemOrFail(itemId);
    if (item.huid && item.huid !== dto.huid) {
      throw new ConflictException('Item already has a different HUID registered');
    }
    await this.assertHuidUnique(dto.huid, itemId);

    return this.prisma.$transaction(async (tx) => {
      await tx.item.update({ where: { id: itemId }, data: { huid: dto.huid } });
      return tx.huidLog.create({
        data: { itemId, huid: dto.huid, action: 'REGISTERED', bisResponse: dto.notes },
      });
    });
  }

  async findHuidLog(page = 1, limit = 20) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.huidLog.findMany({
        include: { item: { select: { id: true, sku: true, name: true } } },
        orderBy: { loggedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.huidLog.count(),
    ]);
    return { rows, meta: paginationMeta(page, limit, total) };
  }

  // ─── Valuation ─────────────────────────────────────────────────────────────

  async getValuation(itemId: string) {
    const item = await this.findItemOrFail(itemId);
    const metal = PURITY_TO_METAL[item.purity as Purity];
    const rateKey = `rate:${metal}:${item.purity}`;
    const cached = await this.redis.getJson<{ ratePerGram: number; snappedAt: string }>(rateKey);

    if (!cached) return { item: { id: item.id, sku: item.sku, name: item.name }, valuation: null, reason: 'Rate not available' };

    const netWt = item.netWeightG.toNumber();
    const ratePerGram = cached.ratePerGram;
    const metalValue = netWt * ratePerGram;
    const makingCharge = item.makingPct.toNumber() > 0
      ? metalValue * (item.makingPct.toNumber() / 100)
      : item.makingPerGram.toNumber() * netWt;
    const totalValue = metalValue + makingCharge + item.stoneValue.toNumber();

    return {
      item: { id: item.id, sku: item.sku, name: item.name },
      valuation: {
        metalValue: parseFloat(metalValue.toFixed(2)),
        makingCharge: parseFloat(makingCharge.toFixed(2)),
        stoneValue: item.stoneValue.toNumber(),
        totalValue: parseFloat(totalValue.toFixed(2)),
        ratePerGram,
        snappedAt: cached.snappedAt,
      },
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async findCategoryOrFail(id: string) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    return cat;
  }

  private async findItemOrFail(id: string) {
    const item = await this.prisma.item.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  private async assertHuidUnique(huid: string, excludeItemId?: string) {
    const conflict = await this.prisma.item.findFirst({
      where: { huid, ...(excludeItemId ? { id: { not: excludeItemId } } : {}), deletedAt: null },
    });
    if (conflict) throw new ConflictException(`HUID "${huid}" is already assigned to another item`);
  }

  private toSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private async generateSku(categoryId: string): Promise<string> {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
    const prefix = (cat?.slug ?? 'item').substring(0, 6).toUpperCase().replace(/-/g, '');
    const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const count = await this.prisma.item.count({ where: { categoryId } });
    const seq = String(count + 1).padStart(4, '0');
    return `${prefix}-${yyyymm}-${seq}`;
  }
}
