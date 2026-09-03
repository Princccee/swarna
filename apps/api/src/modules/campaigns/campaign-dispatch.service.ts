import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { WhatsAppClient } from '../whatsapp/whatsapp.client';

const BATCH_SIZE = 50;        // messages per batch
const BATCH_DELAY_MS = 2000;  // 2 s between batches (rate-limit safety)

@Injectable()
export class CampaignDispatchService {
  private readonly logger = new Logger(CampaignDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wa: WhatsAppClient,
  ) {}

  // ── Cron: every morning at 9 AM — fire DAILY campaigns ──────────────────
  @Cron('0 9 * * *', { timeZone: 'Asia/Kolkata' })
  async runDailyCampaigns() {
    this.logger.log('Running daily campaigns...');
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: 'ACTIVE', scheduleType: 'DAILY' },
      include: { template: true },
    });
    for (const campaign of campaigns) {
      await this.dispatchCampaign(campaign.id).catch((e) =>
        this.logger.error(`Daily campaign ${campaign.id} failed: ${e.message}`),
      );
    }
  }

  // ── Cron: every Monday at 10 AM — fire WEEKLY campaigns ─────────────────
  @Cron('0 10 * * 1', { timeZone: 'Asia/Kolkata' })
  async runWeeklyCampaigns() {
    this.logger.log('Running weekly campaigns...');
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: 'ACTIVE', scheduleType: 'WEEKLY' },
      include: { template: true },
    });
    for (const campaign of campaigns) {
      await this.dispatchCampaign(campaign.id).catch((e) =>
        this.logger.error(`Weekly campaign ${campaign.id} failed: ${e.message}`),
      );
    }
  }

  // ── Cron: every minute — fire ONCE campaigns whose time has arrived ──────
  @Cron('* * * * *')
  async runScheduledOnceCampaigns() {
    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        scheduleType: 'ONCE',
        scheduledAt: { lte: now },
        lastRunAt: null,
      },
      include: { template: true },
    });
    for (const campaign of campaigns) {
      await this.dispatchCampaign(campaign.id).catch((e) =>
        this.logger.error(`Once campaign ${campaign.id} failed: ${e.message}`),
      );
    }
  }

  /** Main dispatch: resolves audience, enqueues sends, updates stats */
  async dispatchCampaign(campaignId: string): Promise<{ sent: number; failed: number }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${campaignId} not found`);

    this.logger.log(`Dispatching campaign "${campaign.name}" (${campaignId})`);

    // Resolve audience
    const customers = await this.resolveAudience(campaign.audienceFilter as any);
    this.logger.log(`Audience size: ${customers.length}`);

    if (customers.length === 0) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { lastRunAt: new Date(), status: campaign.scheduleType === 'ONCE' ? 'COMPLETED' : undefined },
      });
      return { sent: 0, failed: 0 };
    }

    // Fetch live rates for variable substitution
    const rates = await this.getLiveRates();

    let totalSent = 0;
    let totalFailed = 0;

    // Process in batches
    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
      const batch = customers.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (customer) => {
          const variables = this.buildVariables(campaign.template, customer, rates);

          // Create the message record
          const msg = await this.prisma.campaignMessage.create({
            data: {
              campaignId,
              customerId: customer.id,
              phone: customer.phone,
              variables,
              status: 'PENDING',
            },
          });

          // Send via WhatsApp
          const result = await this.wa.sendTemplate(
            customer.phone,
            campaign.template.name,
            campaign.template.language,
            Object.values(variables) as string[],
          );

          if (result.messageId) {
            await this.prisma.campaignMessage.update({
              where: { id: msg.id },
              data: { status: 'SENT', waMessageId: result.messageId, sentAt: new Date() },
            });
            totalSent++;
          } else {
            await this.prisma.campaignMessage.update({
              where: { id: msg.id },
              data: { status: 'FAILED', failReason: result.error ?? 'Unknown' },
            });
            totalFailed++;
          }
        }),
      );

      // Rate-limit: pause between batches
      if (i + BATCH_SIZE < customers.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    // Update campaign stats
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        lastRunAt: new Date(),
        totalSent: { increment: totalSent },
        totalFailed: { increment: totalFailed },
        status: campaign.scheduleType === 'ONCE' ? 'COMPLETED' : undefined,
      },
    });

    this.logger.log(`Campaign "${campaign.name}" done — sent: ${totalSent}, failed: ${totalFailed}`);
    return { sent: totalSent, failed: totalFailed };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async resolveAudience(filter: {
    purities?: string[];
    minPurchases?: number;
    minSpent?: number;
    hasOrders?: boolean;
  } = {}) {
    const where: any = {
      optedOut: false,
      deletedAt: null,
      phone: { not: '0000000000' }, // exclude walk-in
    };

    if (filter.minSpent) {
      where.totalSpent = { gte: filter.minSpent };
    }

    if (filter.minPurchases || filter.hasOrders) {
      where.invoices = { some: {} };
    }

    return this.prisma.customer.findMany({
      where,
      select: { id: true, name: true, phone: true, totalSpent: true },
    });
  }

  private async getLiveRates(): Promise<Record<string, string>> {
    const keys = [
      'rate:GOLD:GOLD_22K',
      'rate:GOLD:GOLD_24K',
      'rate:SILVER:SILVER_999',
    ];
    const rates: Record<string, string> = {};
    for (const key of keys) {
      const data = await this.redis.getJson<{ ratePerGram: number }>(key);
      if (data) rates[key] = Math.round(data.ratePerGram).toLocaleString('en-IN');
    }
    return rates;
  }

  private buildVariables(
    template: { variables: string[] },
    customer: { name: string; phone: string; totalSpent: any },
    rates: Record<string, string>,
  ): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const v of template.variables) {
      switch (v) {
        case 'customerName': vars[v] = customer.name.split(' ')[0]; break;
        case 'gold22kRate':  vars[v] = rates['rate:GOLD:GOLD_22K'] ?? '—'; break;
        case 'gold24kRate':  vars[v] = rates['rate:GOLD:GOLD_24K'] ?? '—'; break;
        case 'silverRate':   vars[v] = rates['rate:SILVER:SILVER_999'] ?? '—'; break;
        case 'shopName':     vars[v] = 'Svarna Jewels'; break;
        default:             vars[v] = '';
      }
    }
    return vars;
  }
}
