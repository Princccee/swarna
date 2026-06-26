import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PricingService } from './pricing.service';
import { IrnService } from './irn.service';
import { PdfService } from './pdf.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PricingService, IrnService, PdfService],
  exports: [BillingService, PricingService],
})
export class BillingModule {}
