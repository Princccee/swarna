import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { PaymentMode } from '@prisma/client';

export class InvoiceLineDto {
  @IsUUID() itemId: string;
  @IsNumber() @Min(1) qty: number;
  @IsOptional() @IsNumber() @Min(0) netWeightG?: number; // override item's net weight if set
}

export class CreateInvoiceDto {
  @IsUUID() customerId: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
  @IsOptional() @IsNumber() @Min(0) oldGoldWeightG?: number;
  @IsOptional() @IsNumber() @Min(0) oldGoldRatePerGram?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() isInterstate?: boolean;
}

export class RecordPaymentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(PaymentMode) mode: PaymentMode;
  @IsOptional() @IsString() reference?: string;
}

export class PreviewInvoiceDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
  @IsOptional() @IsNumber() @Min(0) oldGoldWeightG?: number;
  @IsOptional() @IsNumber() @Min(0) oldGoldRatePerGram?: number;
  @IsOptional() isInterstate?: boolean;
}

export class CreateCustomerDto {
  @IsString() name: string;
  @IsString() phone: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() panNumber?: string;
}
