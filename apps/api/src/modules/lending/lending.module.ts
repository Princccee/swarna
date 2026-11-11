import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { LendingController } from './lending.controller';
import { LendingService } from './lending.service';
import { LendingPdfService } from './lending-pdf.service';

@Module({
  imports: [SettingsModule],
  controllers: [LendingController],
  providers: [LendingService, LendingPdfService],
})
export class LendingModule {}
