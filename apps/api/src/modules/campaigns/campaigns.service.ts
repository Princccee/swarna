import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ── Templates ─────────────────────────────────────────────────────────────

  listTemplates() {
    return this.prisma.whatsAppTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  createTemplate(dto: CreateTemplateDto) {
    return this.prisma.whatsAppTemplate.create({
      data: {
        name: dto.name.toLowerCase().replace(/\s+/g, '_'),
        displayName: dto.displayName,
        bodyText: dto.bodyText,
        variables: dto.variables,
        category: dto.category ?? 'MARKETING',
        language: dto.language ?? 'en',
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto) {
    await this.findTemplateOrThrow(id);
    return this.prisma.whatsAppTemplate.update({ where: { id }, data: dto });
  }

  async deleteTemplate(id: string) {
    await this.findTemplateOrThrow(id);
    return this.prisma.whatsAppTemplate.delete({ where: { id } });
  }

  private async findTemplateOrThrow(id: string) {
    const t = await this.prisma.whatsAppTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return t;
  }

  // ── Campaigns ─────────────────────────────────────────────────────────────

  listCampaigns(status?: string) {
    return this.prisma.campaign.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        template: { select: { id: true, displayName: true, name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createCampaign(dto: CreateCampaignDto, createdBy: string) {
    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        templateId: dto.templateId,
        scheduleType: dto.scheduleType as any,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        cronExpr: dto.cronExpr,
        audienceFilter: dto.audienceFilter ?? {},
        createdBy,
      },
      include: { template: true },
    });
  }

  async getCampaign(id: string) {
    const c = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        template: true,
        _count: { select: { messages: true } },
      },
    });
    if (!c) throw new NotFoundException(`Campaign ${id} not found`);

    // Message status breakdown
    const statusCounts = await this.prisma.campaignMessage.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    });

    return { ...c, statusCounts };
  }

  async updateCampaign(id: string, dto: UpdateCampaignDto) {
    await this.getCampaign(id);
    const { scheduleType, scheduledAt, audienceFilter, ...rest } = dto;
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...rest,
        ...(scheduleType ? { scheduleType: scheduleType as any } : {}),
        ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}),
        ...(audienceFilter !== undefined ? { audienceFilter } : {}),
      },
    });
  }

  async setCampaignStatus(id: string, status: string) {
    await this.getCampaign(id);
    return this.prisma.campaign.update({
      where: { id },
      data: { status: status as any },
    });
  }

  async getCampaignMessages(id: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      this.prisma.campaignMessage.findMany({
        where: { campaignId: id },
        include: { customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.campaignMessage.count({ where: { campaignId: id } }),
    ]);
    return { messages, total, page, limit, pages: Math.ceil(total / limit) };
  }

  getWhatsAppStatus() {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    return {
      configured: !!(token && phoneId),
      phoneNumberId: phoneId ? `...${phoneId.slice(-4)}` : null,
    };
  }
}
