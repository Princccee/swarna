import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@svarna/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Actor, LendingService } from './lending.service';
import { LendingPdfService } from './lending-pdf.service';
import { CreateLoanDto, ForfeitDto, ListLoansDto, PaymentDto, PledgeDto, ValuationDto } from './dto/lending.dto';

/** Lending (girvi). Owner and staff run loans; the accountant can view and print. */
@Controller('lending')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LendingController {
  constructor(
    private readonly lending: LendingService,
    private readonly pdf: LendingPdfService,
  ) {}

  @Get('summary')
  @Roles(Role.OWNER, Role.STAFF, Role.ACCOUNTANT)
  summary() {
    return this.lending.summary();
  }

  @Get('loans')
  @Roles(Role.OWNER, Role.STAFF, Role.ACCOUNTANT)
  list(@Query() q: ListLoansDto) {
    return this.lending.listLoans(q.tab ?? 'active', q.search);
  }

  @Get('loans/:id')
  @Roles(Role.OWNER, Role.STAFF, Role.ACCOUNTANT)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.lending.getLoan(id);
  }

  @Post('valuation')
  @HttpCode(200)
  @Roles(Role.OWNER, Role.STAFF)
  valuation(@Body() dto: ValuationDto) {
    return this.lending.valuate(dto.items);
  }

  @Post('loans')
  @Roles(Role.OWNER, Role.STAFF)
  create(@Body() dto: CreateLoanDto, @CurrentUser() user: Actor) {
    return this.lending.createLoan(dto, user);
  }

  @Post('loans/:id/payments/preview')
  @HttpCode(200)
  @Roles(Role.OWNER, Role.STAFF)
  previewPayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto, @CurrentUser() user: Actor) {
    return this.lending.previewPayment(id, dto, user);
  }

  @Post('loans/:id/payments')
  @Roles(Role.OWNER, Role.STAFF)
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentDto, @CurrentUser() user: Actor) {
    return this.lending.recordPayment(id, dto, user);
  }

  @Post('loans/:id/payments/reverse-latest')
  @HttpCode(200)
  @Roles(Role.OWNER)
  reverse(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: Actor) {
    return this.lending.reverseLatestPayment(id, user);
  }

  @Post('loans/:id/merchant')
  @HttpCode(200)
  @Roles(Role.OWNER, Role.STAFF)
  pledge(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PledgeDto, @CurrentUser() user: Actor) {
    return this.lending.pledgeToMerchant(id, dto, user);
  }

  @Post('loans/:id/merchant/return')
  @HttpCode(200)
  @Roles(Role.OWNER, Role.STAFF)
  merchantReturn(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: Actor) {
    return this.lending.returnFromMerchant(id, user);
  }

  @Post('loans/:id/forfeit')
  @HttpCode(200)
  @Roles(Role.OWNER, Role.STAFF)
  forfeit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ForfeitDto, @CurrentUser() user: Actor) {
    return this.lending.forfeit(id, dto, user);
  }

  @Get('loans/:id/slip.pdf')
  @Roles(Role.OWNER, Role.STAFF, Role.ACCOUNTANT)
  async slip(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const loan = await this.lending.loanForDocument(id);
    this.sendPdf(res, await this.pdf.loanSlip(loan), `loan-slip-${loan.loanNumber}.pdf`);
  }

  @Get('loans/:id/payments/:paymentId/receipt.pdf')
  @Roles(Role.OWNER, Role.STAFF, Role.ACCOUNTANT)
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Res() res: Response,
  ) {
    const { loan, payment } = await this.lending.paymentForDocument(id, paymentId);
    this.sendPdf(res, await this.pdf.paymentReceipt(loan, payment), `receipt-${loan.loanNumber}.pdf`);
  }

  private sendPdf(res: Response, pdf: Buffer, filename: string) {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }
}
