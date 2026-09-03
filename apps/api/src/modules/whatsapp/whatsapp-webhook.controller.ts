import { Controller, Get, Post, Query, Body, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Meta webhook verification handshake */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ?? 'svarna-wa-verify';
    if (mode === 'subscribe' && token === verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  /** Delivery status updates and incoming messages from Meta */
  @Post()
  async receive(@Body() payload: any, @Res() res: Response) {
    // Always respond 200 immediately so Meta doesn't retry
    res.status(200).send('OK');

    try {
      const entries: any[] = payload?.entry ?? [];
      for (const entry of entries) {
        for (const change of entry?.changes ?? []) {
          const value = change?.value;

          // Handle status updates (delivered, read, failed)
          for (const status of value?.statuses ?? []) {
            await this.handleStatusUpdate(status);
          }

          // Handle incoming messages (opt-outs)
          for (const message of value?.messages ?? []) {
            await this.handleIncomingMessage(message);
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Webhook processing error: ${err.message}`);
    }
  }

  private async handleStatusUpdate(status: any) {
    const waMessageId: string = status?.id;
    const statusValue: string = status?.status; // sent | delivered | read | failed

    if (!waMessageId || !statusValue) return;

    const statusMap: Record<string, string> = {
      sent: 'SENT',
      delivered: 'DELIVERED',
      read: 'READ',
      failed: 'FAILED',
    };
    const mapped = statusMap[statusValue];
    if (!mapped) return;

    const updateData: any = { status: mapped };
    if (mapped === 'DELIVERED') updateData.deliveredAt = new Date();
    if (mapped === 'READ') updateData.readAt = new Date();
    if (mapped === 'FAILED') {
      updateData.failReason = status?.errors?.[0]?.title ?? 'Unknown error';
    }

    await this.prisma.campaignMessage.updateMany({
      where: { waMessageId },
      data: updateData,
    });
  }

  private async handleIncomingMessage(message: any) {
    const phone: string = message?.from;
    const text: string = message?.text?.body ?? '';

    if (!phone) return;

    // Handle opt-out keywords
    const optOutKeywords = ['stop', 'unsubscribe', 'opt out', 'optout', 'रुको', 'बंद'];
    const isOptOut = optOutKeywords.some((kw) =>
      text.trim().toLowerCase().includes(kw),
    );

    if (isOptOut) {
      // Normalize phone to match our DB format
      const normalized = phone.replace(/^91/, '');
      await this.prisma.customer.updateMany({
        where: { phone: normalized },
        data: { optedOut: true, optedOutAt: new Date() },
      });
      this.logger.log(`Customer ${phone} opted out`);
    }
  }
}
