import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@svarna/shared-types';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto, UpdateOrderStatusDto, OrderPaymentDto, KarigarEntryDto } from './dto/order.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(Role.OWNER, Role.STAFF)
  create(@Body() dto: CreateOrderDto) { return this.orders.createOrder(dto); }

  @Get()
  @Roles(Role.OWNER, Role.STAFF)
  list(@Query() q: any) {
    return this.orders.listOrders({
      page: Number(q.page) || 1, limit: Number(q.limit) || 20,
      status: q.status, type: q.type, customerId: q.customerId,
      assignedToId: q.assignedToId, dueSoon: q.dueSoon === 'true',
    });
  }

  @Get('karigar/balance')
  @Roles(Role.OWNER)
  karigarBalance() { return this.orders.getKarigarBalance(); }

  @Get('karigar/ledger')
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  karigarLedger(@Query() q: any) {
    return this.orders.getKarigarLedger({
      page: Number(q.page) || 1, limit: Number(q.limit) || 20,
      from: q.from, to: q.to, karigarUserId: q.karigarUserId,
    });
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.STAFF)
  get(@Param('id') id: string) { return this.orders.getOrder(id); }

  @Patch(':id')
  @Roles(Role.OWNER, Role.STAFF)
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) { return this.orders.updateOrder(id, dto); }

  @Patch(':id/status')
  @Roles(Role.OWNER, Role.STAFF)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) { return this.orders.updateOrderStatus(id, dto); }

  @Post(':id/payments')
  @Roles(Role.OWNER, Role.STAFF)
  recordPayment(@Param('id') id: string, @Body() dto: OrderPaymentDto) { return this.orders.recordOrderPayment(id, dto); }

  @Post(':id/cancel')
  @Roles(Role.OWNER)
  cancel(@Param('id') id: string) { return this.orders.cancelOrder(id); }

  @Post(':id/karigar')
  @Roles(Role.OWNER, Role.STAFF)
  addKarigar(@Param('id') id: string, @Body() dto: KarigarEntryDto) { return this.orders.addKarigarEntry(id, dto); }
}
