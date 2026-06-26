import { Body, Controller, Get, Post, Query, Param, Headers, UnauthorizedException } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { CustomerRegisterDto, CustomerLoginDto, ReserveItemDto } from './dto/catalogue.dto';
import * as jwt from 'jsonwebtoken';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  // Public routes — no auth required

  @Get('categories')
  getCategories() {
    return this.catalogue.listCatalogueCategories();
  }

  @Get('items')
  getItems(@Query() q: any) {
    return this.catalogue.listCatalogueItems({
      categoryId: q.categoryId,
      purity: q.purity,
      search: q.search,
      page: Number(q.page) || 1,
      limit: Number(q.limit) || 20,
    });
  }

  @Get('items/:id')
  getItem(@Param('id') id: string) {
    return this.catalogue.getCatalogueItem(id);
  }

  @Post('auth/register')
  register(@Body() dto: CustomerRegisterDto) {
    return this.catalogue.registerCustomer(dto);
  }

  @Post('auth/login')
  login(@Body() dto: CustomerLoginDto) {
    return this.catalogue.loginCustomer(dto);
  }

  // Customer-authenticated routes — JWT with role=CUSTOMER required

  @Post('reserve')
  reserve(
    @Headers('authorization') auth: string,
    @Body() dto: ReserveItemDto,
  ) {
    const customerId = this.extractCustomerId(auth);
    return this.catalogue.reserveItem(customerId, dto);
  }

  @Get('my-orders')
  myOrders(@Headers('authorization') auth: string) {
    const customerId = this.extractCustomerId(auth);
    return this.catalogue.getMyOrders(customerId);
  }

  private extractCustomerId(auth: string): string {
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();
    try {
      const payload = jwt.verify(
        auth.slice(7),
        process.env.JWT_ACCESS_SECRET!,
      ) as any;
      if (!payload.customerId) throw new UnauthorizedException();
      return payload.customerId;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
