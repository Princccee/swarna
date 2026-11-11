import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { S3Service } from './s3.service';

@Module({
  providers: [InventoryService, S3Service],
  controllers: [InventoryController],
  exports: [InventoryService, S3Service],
})
export class InventoryModule {}
