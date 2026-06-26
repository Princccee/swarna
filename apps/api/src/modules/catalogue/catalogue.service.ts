import { Injectable, NotFoundException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import {
  CustomerRegisterDto,
  CustomerLoginDto,
  ReserveItemDto,
} from './dto/catalogue.dto';

type RateCache = { ratePerGram: number };

function metalFromPurity(purity: string): string {
  if (purity.startsWith('SILVER')) return 'SILVER';
  if (purity.startsWith('PLATINUM')) return 'PLATINUM';
  return 'GOLD';
}

@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public catalogue — items
  // ---------------------------------------------------------------------------

  async listCatalogueItems(query: {
    categoryId?: string;
    purity?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ItemWhereInput = {
      catalogueVisible: true,
      active: true,
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.purity ? { purity: query.purity as any } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rawItems] = await Promise.all([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, name: true } },
        },
      }),
    ]);

    const items = await Promise.all(
      rawItems.map(async (item) => {
        const metal = metalFromPurity(item.purity);
        const cached = await this.redis.getJson<RateCache>(`rate:${metal}:${item.purity}`);
        const indicativePrice = cached
          ? Number(item.netWeightG) * cached.ratePerGram + Number(item.stoneValue)
          : null;

        return { ...item, indicativePrice };
      }),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getCatalogueItem(id: string) {
    const item = await this.prisma.item.findFirst({
      where: {
        id,
        catalogueVisible: true,
        active: true,
        deletedAt: null,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found or not available in catalogue');
    }

    const metal = metalFromPurity(item.purity);
    const cached = await this.redis.getJson<RateCache>(`rate:${metal}:${item.purity}`);
    const indicativePrice = cached
      ? Number(item.netWeightG) * cached.ratePerGram + Number(item.stoneValue)
      : null;

    return { ...item, indicativePrice };
  }

  // ---------------------------------------------------------------------------
  // Public catalogue — categories
  // ---------------------------------------------------------------------------

  async listCatalogueCategories() {
    return this.prisma.category.findMany({
      where: { visible: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Customer auth — register
  // ---------------------------------------------------------------------------

  async registerCustomer(
    dto: CustomerRegisterDto,
  ): Promise<{ accessToken: string; customer: any }> {
    // Check phone uniqueness across User records with CUSTOMER role
    const existingUser = await this.prisma.user.findFirst({
      where: { phone: dto.phone, role: 'CUSTOMER' },
    });
    if (existingUser) {
      throw new ConflictException('A customer account with this phone number already exists');
    }

    // Also check Customer table for existing record
    const existingCustomer = await this.prisma.customer.findUnique({
      where: { phone: dto.phone },
    });
    if (existingCustomer && existingCustomer.userId) {
      throw new ConflictException('A customer account with this phone number already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create a User record with role=CUSTOMER to hold credentials
    const syntheticEmail = `${dto.phone}@customer.swarna`;

    // Ensure the synthetic email isn't already taken (edge case: re-registration attempt)
    const existingEmail = await this.prisma.user.findUnique({ where: { email: syntheticEmail } });
    if (existingEmail) {
      throw new ConflictException('A customer account with this phone number already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: syntheticEmail,
        phone: dto.phone,
        passwordHash,
        role: 'CUSTOMER',
      },
      select: { id: true, name: true, phone: true, role: true, createdAt: true },
    });

    // Create or link Customer record
    let customer: any;
    if (existingCustomer) {
      // Link the pre-existing Customer record (walk-in) to this User
      customer = await this.prisma.customer.update({
        where: { phone: dto.phone },
        data: { userId: user.id, email: dto.email ?? undefined },
      });
    } else {
      customer = await this.prisma.customer.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          email: dto.email ?? null,
          userId: user.id,
        },
      });
    }

    const accessToken = this._signToken(user.id, customer.id);

    return { accessToken, customer };
  }

  // ---------------------------------------------------------------------------
  // Customer auth — login
  // ---------------------------------------------------------------------------

  async loginCustomer(
    dto: CustomerLoginDto,
  ): Promise<{ accessToken: string; customer: any }> {
    const user = await this.prisma.user.findFirst({
      where: { phone: dto.phone, role: 'CUSTOMER', active: true, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid phone number or password');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid phone number or password');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { phone: dto.phone },
    });

    if (!customer) {
      throw new UnauthorizedException('Customer profile not found');
    }

    const accessToken = this._signToken(user.id, customer.id);

    return { accessToken, customer };
  }

  // ---------------------------------------------------------------------------
  // Reserve item (pre-order)
  // ---------------------------------------------------------------------------

  async reserveItem(customerId: string, dto: ReserveItemDto): Promise<any> {
    // Verify item is available in catalogue
    const item = await this.prisma.item.findFirst({
      where: {
        id: dto.itemId,
        catalogueVisible: true,
        active: true,
        deletedAt: null,
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found or not available for reservation');
    }

    const orderNumber = await this._generateOrderNumber();

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        type: 'PRE_ORDER',
        status: 'CONFIRMED',
        customerId,
        description: dto.notes ?? null,
        expectedReady: dto.expectedDate ? new Date(dto.expectedDate) : null,
        metalPurity: item.purity,
      },
      select: {
        id: true,
        orderNumber: true,
        type: true,
        status: true,
        description: true,
        expectedReady: true,
        estimatedValue: true,
        balanceDue: true,
        createdAt: true,
      },
    });

    return order;
  }

  // ---------------------------------------------------------------------------
  // Get customer's own orders
  // ---------------------------------------------------------------------------

  async getMyOrders(customerId: string): Promise<any[]> {
    return this.prisma.order.findMany({
      where: {
        customerId,
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        type: true,
        status: true,
        expectedReady: true,
        estimatedValue: true,
        balanceDue: true,
        createdAt: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _signToken(userId: string, customerId: string): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }
    return jwt.sign(
      { sub: userId, role: 'CUSTOMER', customerId },
      secret,
      { expiresIn: '15m' },
    );
  }

  private async _generateOrderNumber(): Promise<string> {
    const now = new Date();
    const datePart =
      String(now.getFullYear()) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');

    const prefix = `ORD-${datePart}-`;

    // Find highest sequence for today
    const lastOrder = await this.prisma.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    let sequence = 1;
    if (lastOrder) {
      const parts = lastOrder.orderNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }
}
