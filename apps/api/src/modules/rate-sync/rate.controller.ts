import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, Metal, Purity } from '@svarna/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RateSyncService } from './rate-sync.service';
import { QueryRateHistoryDto } from './dto/query-rate-history.dto';
import { SetManualRatesDto } from './dto/manual-rates.dto';

@Controller('rates')
export class RateController {
  constructor(private readonly rateSyncService: RateSyncService) {}

  @Get('current')
  getCurrentRates() {
    return this.rateSyncService.getCurrentRates();
  }

  /** Provider, freshness of each rate, quota, last fetch result and any rates awaiting approval. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ACCOUNTANT, Role.STAFF)
  @Get('status')
  getStatus() {
    return this.rateSyncService.getStatus();
  }

  /** Fetch from metals.dev now (subject to the 20-minute cooldown and monthly budget). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @Post('fetch-now')
  @HttpCode(200)
  fetchNow() {
    return this.rateSyncService.syncFromMetalsDev('manual');
  }

  /** Owner-entered rates (per 10 g); they override fetched rates until midnight IST. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @Post('manual')
  @HttpCode(200)
  setManual(@Body() dto: SetManualRatesDto) {
    return this.rateSyncService.setManualRates(dto.rates);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @Post('pending/approve')
  @HttpCode(200)
  approvePending() {
    return this.rateSyncService.approvePending();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @Post('pending/reject')
  @HttpCode(200)
  async rejectPending() {
    await this.rateSyncService.rejectPending();
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  @Get('history')
  getRateHistory(@Query() query: QueryRateHistoryDto) {
    return this.rateSyncService.getRateHistory(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  @Get('history/:metal/:purity')
  getRateHistoryForPurity(
    @Param('metal') metal: Metal,
    @Param('purity') purity: Purity,
    @Query() query: QueryRateHistoryDto,
  ) {
    return this.rateSyncService.getRateHistory({ ...query, metal, purity });
  }
}
