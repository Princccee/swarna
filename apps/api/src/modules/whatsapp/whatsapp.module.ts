import { Module } from '@nestjs/common';
import { WhatsAppClient } from './whatsapp.client';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

@Module({
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppClient],
  exports: [WhatsAppClient],
})
export class WhatsAppModule {}
