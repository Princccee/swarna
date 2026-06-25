import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, Metal, Purity } from '@svarna/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RateSyncService } from './rate-sync.service';
import { QueryRateHistoryDto } from './dto/query-rate-history.dto';

@Controller('rates')
export class RateController {
  constructor(private readonly rateSyncService: RateSyncService) {}

  @Get('current')
  getCurrentRates() {
    return this.rateSyncService.getCurrentRates();
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
