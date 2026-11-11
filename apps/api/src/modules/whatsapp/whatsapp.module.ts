import { Module } from '@nestjs/common';
import { WhatsAppClient } from './whatsapp.client';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppBotService } from './whatsapp-bot.service';
import { RateSyncModule } from '../rate-sync/rate-sync.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [RateSyncModule, SettingsModule],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppClient, WhatsAppBotService],
  exports: [WhatsAppClient],
})
export class WhatsAppModule {}
