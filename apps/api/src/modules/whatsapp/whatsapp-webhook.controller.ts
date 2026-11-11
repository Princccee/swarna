import { Controller, Get, Post, Query, Body, Res, Req, Headers, Logger, RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { WhatsAppBotService } from './whatsapp-bot.service';

@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bot: WhatsAppBotService,
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
  async receive(
    @Body() payload: any,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Res() res: Response,
  ) {
    if (!this.isSignatureValid(req.rawBody, signature)) {
      this.logger.warn('Rejected WhatsApp webhook with missing/invalid signature');
      res.status(401).send('Invalid signature');
      return;
    }

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

          // Incoming customer messages: keyword auto-replies + STOP/START
          for (const message of value?.messages ?? []) {
            await this.bot.handleIncoming(message).catch((err) =>
              this.logger.error(`Bot reply failed: ${err.message}`),
            );
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

  /**
   * Verifies Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret).
   * If WHATSAPP_APP_SECRET is unset (local dev), verification is skipped with a warning.
   */
  private isSignatureValid(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!secret) {
      if (!this.warnedNoSecret) {
        this.logger.warn('WHATSAPP_APP_SECRET not set — webhook signatures are NOT being verified');
        this.warnedNoSecret = true;
      }
      return true;
    }
    if (!rawBody || !signature?.startsWith('sha256=')) return false;
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
    const given = Buffer.from(signature.slice('sha256='.length));
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private warnedNoSecret = false;
}
