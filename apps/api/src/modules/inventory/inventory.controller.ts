import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch,
  Post, Query, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@svarna/shared-types';
import { InventoryService } from './inventory.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryItemsDto } from './dto/query-items.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { RegisterHuidDto } from './dto/register-huid.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ─── Categories ─────────────────────────────────────────────────────────────

  @Get('categories')
  findAllCategories() {
    return this.inventoryService.findAllCategories();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.inventoryService.createCategory(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.inventoryService.updateCategory(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.inventoryService.deleteCategory(id);
  }

  // ─── Items ──────────────────────────────────────────────────────────────────

  @Get('items')
  findAllItems(@Query() query: QueryItemsDto) {
    return this.inventoryService.findAllItems(query);
  }

  @Get('items/:id')
  findOneItem(@Param('id') id: string) {
    return this.inventoryService.findOneItem(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.STAFF)
  @Post('items')
  createItem(@Body() dto: CreateItemDto) {
    return this.inventoryService.createItem(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.STAFF)
  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.inventoryService.updateItem(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @Delete('items/:id')
  deleteItem(@Param('id') id: string) {
    return this.inventoryService.deleteItem(id);
  }

  // ─── Images ─────────────────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.STAFF)
  @Post('items/:id/images')
  @UseInterceptors(FilesInterceptor('images', 10, { storage: memoryStorage() }))
  addImages(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.inventoryService.addImages(id, files);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @Delete('items/:id/images/:index')
  removeImage(@Param('id') id: string, @Param('index', ParseIntPipe) index: number) {
    return this.inventoryService.removeImage(id, index);
  }

  // ─── Stock ──────────────────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.STAFF)
  @Post('items/:id/stock')
  createStockMovement(@Param('id') id: string, @Body() dto: StockMovementDto) {
    return this.inventoryService.createStockMovement(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.STAFF)
  @Get('items/:id/stock-history')
  getStockHistory(
    @Param('id') id: string,
    @Query() query: PaginationDto,
  ) {
    return this.inventoryService.findStockHistory(id, query.page, query.limit);
  }

  // ─── HUID ───────────────────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @Post('items/:id/huid')
  registerHuid(@Param('id') id: string, @Body() dto: RegisterHuidDto) {
    return this.inventoryService.registerHuid(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ACCOUNTANT)
  @Get('huid-log')
  findHuidLog(@Query() query: PaginationDto) {
    return this.inventoryService.findHuidLog(query.page, query.limit);
  }

  // ─── Valuation ───────────────────────────────────────────────────────────────

  @Get('items/:id/valuation')
  getValuation(@Param('id') id: string) {
    return this.inventoryService.getValuation(id);
  }
}
