import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignDispatchService } from './campaign-dispatch.service';
import { ShareKitController } from './share-kit.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { RateSyncModule } from '../rate-sync/rate-sync.module';
import { SettingsModule } from '../settings/settings.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [WhatsAppModule, RateSyncModule, SettingsModule, InventoryModule],
  controllers: [CampaignsController, ShareKitController],
  providers: [CampaignsService, CampaignDispatchService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
