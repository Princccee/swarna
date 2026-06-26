import { Module } from '@nestjs/common';
import { RateSyncService } from './rate-sync.service';
import { RateController } from './rate.controller';
import { RateGateway } from './rate.gateway';

@Module({
  providers: [RateSyncService, RateGateway],
  controllers: [RateController],
  exports: [RateSyncService],
})
export class RateSyncModule {}
