import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { RateSyncModule } from './modules/rate-sync/rate-sync.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { BillingModule } from './modules/billing/billing.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import appConfig from './config/app.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: '../../.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    HealthModule,
    RateSyncModule,
    InventoryModule,
    BillingModule,
    OrdersModule,
    CatalogueModule,
  ],
})
export class AppModule {}
