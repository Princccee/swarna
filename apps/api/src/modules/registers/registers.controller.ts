import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@svarna/shared-types';
import { RegistersService } from './registers.service';

@Controller('registers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegistersController {
  constructor(private readonly registers: RegistersService) {}

  @Get('sales')
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  getSales(@Query() q: any) {
    return this.registers.getSalesRegister({ from: q.from, to: q.to, page: Number(q.page)||1, limit: Number(q.limit)||50 });
  }

  @Get('purchases')
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  getPurchases(@Query() q: any) {
    return this.registers.getPurchaseRegister({ from: q.from, to: q.to, page: Number(q.page)||1, limit: Number(q.limit)||50 });
  }

  @Get('old-gold')
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  getOldGold(@Query() q: any) {
    return this.registers.getOldGoldRegister({ from: q.from, to: q.to, page: Number(q.page)||1, limit: Number(q.limit)||50 });
  }

  @Get('huid-log')
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  getHuidLog(@Query() q: any) {
    return this.registers.getHuidLog({ from: q.from, to: q.to, page: Number(q.page)||1, limit: Number(q.limit)||50 });
  }

  @Get('audit')
  @Roles(Role.OWNER)
  getAudit(@Query() q: any) {
    return this.registers.getAuditTrail({ entityType: q.entityType, actorId: q.actorId, from: q.from, to: q.to, page: Number(q.page)||1, limit: Number(q.limit)||50 });
  }

  @Get('stock-audit')
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  getStockAudit() { return this.registers.getStockAudit(); }

  @Get('kyc')
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  getKyc(@Query() q: any) {
    return this.registers.getKycRegister({ page: Number(q.page)||1, limit: Number(q.limit)||50 });
  }

  @Get('gst/gstr1')
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  getGstr1(@Query() q: any) { return this.registers.getGstr1Data({ from: q.from, to: q.to }); }

  @Get('gst/gstr3b')
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  getGstr3b(@Query() q: any) {
    return this.registers.getGstr3bSummary({ month: Number(q.month), year: Number(q.year) });
  }
}
