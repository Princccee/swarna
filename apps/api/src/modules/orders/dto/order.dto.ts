import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { OrderType, PaymentMode, Purity } from '@prisma/client';

export class CreateOrderDto {
  @IsUUID() customerId: string;
  @IsEnum(OrderType) type: OrderType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Purity) metalPurity?: Purity;
  @IsOptional() @IsNumber() @Min(0) estimatedWeightG?: number;
  @IsOptional() @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional() @IsNumber() @Min(0) advancePaid?: number;
  @IsOptional() @IsDateString() expectedReady?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateOrderDto {
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(Purity) metalPurity?: Purity;
  @IsOptional() @IsNumber() @Min(0) estimatedWeightG?: number;
  @IsOptional() @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional() @IsDateString() expectedReady?: string;
  @IsOptional() @IsString() assignedToId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateOrderStatusDto {
  @IsString() status: string;
  @IsOptional() @IsUUID() invoiceId?: string;
}

export class OrderPaymentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(PaymentMode) mode: PaymentMode;
  @IsOptional() @IsString() reference?: string;
}

export class KarigarEntryDto {
  @IsUUID() karigarUserId: string;
  @IsEnum({ ISSUED: 'ISSUED', RETURNED: 'RETURNED' }) entryType: string;
  @IsNumber() @Min(0.001) goldWeightG: number;
  @IsOptional() @IsString() metal?: string;
  @IsOptional() @IsString() purity?: string;
  @IsOptional() @IsString() notes?: string;
}
