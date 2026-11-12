import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule], // S3Service for order design photos
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
