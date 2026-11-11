import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@svarna/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { RateSyncService } from '../rate-sync/rate-sync.service';
import { SettingsService } from '../settings/settings.service';
import { S3Service } from '../inventory/s3.service';

/**
 * Data for the Share Kit: the web app renders shareable images (rate card, design
 * collage) in the browser, and staff post them to a WhatsApp Channel/Status by hand.
 */
@Controller('marketing/share')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.STAFF)
export class ShareKitController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RateSyncService,
    private readonly settings: SettingsService,
    private readonly s3: S3Service,
  ) {}

  /** Shop details + live rates for the rate card. */
  @Get('rates')
  async rateCard() {
    const [all, rates] = await Promise.all([this.settings.getAll(), this.rates.getCurrentRates()]);
    return {
      shop: {
        name: all.shopName,
        address: all.shopAddress,
        phone: all.shopPhone,
        whatsappNumber: all.whatsappNumber || all.shopPhone,
      },
      rates,
    };
  }

  /** In-stock items to pick for a design collage. */
  @Get('items')
  async items(@Query('search') search?: string) {
    const items = await this.prisma.item.findMany({
      where: {
        active: true,
        deletedAt: null,
        stockQty: { gt: 0 },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        id: true, sku: true, name: true, purity: true, netWeightG: true,
        imageUrls: true, catalogueVisible: true, createdAt: true,
        category: { select: { name: true } },
      },
    });
    return items.map(({ imageUrls, netWeightG, category, ...it }) => ({
      ...it,
      netWeightG: Number(netWeightG),
      categoryName: category.name,
      hasImage: imageUrls.length > 0,
    }));
  }

  /**
   * An item's first photo, served same-origin so the browser can draw it onto a
   * canvas and export it (cross-origin images would taint the canvas).
   */
  @Get('items/:id/image')
  async itemImage(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const item = await this.prisma.item.findUnique({ where: { id }, select: { imageUrls: true } });
    const url = item?.imageUrls[0];
    const obj = url ? await this.s3.getObjectByUrl(url) : null;
    if (!obj) throw new NotFoundException('Image not found');
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(obj.body);
  }
}
