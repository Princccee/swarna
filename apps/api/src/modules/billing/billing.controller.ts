import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@svarna/shared-types';
import { BillingService } from './billing.service';
import { CreateInvoiceDto, CreateCustomerDto, RecordPaymentDto, PreviewInvoiceDto } from './dto/create-invoice.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // Invoices
  @Post('invoices')
  @Roles(Role.OWNER, Role.STAFF)
  createInvoice(@Body() dto: CreateInvoiceDto, @Req() req: any) {
    return this.billing.createInvoice(dto, req.user.id);
  }

  @Get('invoices')
  @Roles(Role.OWNER, Role.STAFF, Role.ACCOUNTANT)
  listInvoices(@Query() q: any) {
    return this.billing.listInvoices({
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 20,
      customerId: q.customerId,
      status: q.status,
      search: q.search,
      from: q.from,
      to: q.to,
    });
  }

  @Get('invoices/:id')
  @Roles(Role.OWNER, Role.STAFF, Role.ACCOUNTANT)
  getInvoice(@Param('id') id: string) {
    return this.billing.getInvoice(id);
  }

  @Post('invoices/:id/payments')
  @Roles(Role.OWNER, Role.STAFF)
  recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.billing.recordPayment(id, dto);
  }

  @Post('invoices/:id/cancel')
  @Roles(Role.OWNER)
  cancelInvoice(@Param('id') id: string, @Req() req: any) {
    return this.billing.cancelInvoice(id, req.user.id);
  }

  @Get('invoices/:id/pdf')
  @Roles(Role.OWNER, Role.STAFF, Role.ACCOUNTANT)
  async getInvoicePdf(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.billing.getInvoicePdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="invoice.pdf"' });
    res.send(pdf);
  }

  // Preview
  @Post('preview')
  @Roles(Role.OWNER, Role.STAFF)
  previewInvoice(@Body() dto: PreviewInvoiceDto) {
    return this.billing.previewInvoice(dto);
  }

  // Customers
  @Get('customers')
  @Roles(Role.OWNER, Role.STAFF)
  listCustomers(@Query('search') search: string) {
    return this.billing.listCustomers(search);
  }

  @Post('customers')
  @Roles(Role.OWNER, Role.STAFF)
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.billing.createCustomer(dto);
  }

  @Get('customers/:id/history')
  @Roles(Role.OWNER, Role.STAFF)
  getCustomerHistory(@Param('id') id: string) {
    return this.billing.getCustomerHistory(id);
  }
}
