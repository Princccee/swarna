import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { BillType, PaymentMode, Purity } from '@prisma/client';

/**
 * A bill line is either an inventory item (itemId) or a manual line typed in at the counter
 * (description + purity + netWeightG, no itemId).
 */
export class InvoiceLineDto {
  @IsOptional() @IsUUID() itemId?: string;
  @IsNumber() @Min(1) qty: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) netWeightG?: number; // inventory: override item's net weight

  /** Any line: rate per gram typed at the counter; defaults to today's live rate for the purity */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.01) ratePerGram?: number;

  // ── Manual lines only ──
  @IsOptional() @IsString() @MaxLength(120) description?: string;
  @IsOptional() @IsEnum(Purity) purity?: Purity;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) makingPct?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) makingPerGram?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) stoneValue?: number;
}

export class CreateInvoiceDto {
  /** Required: every bill is made out to a real customer */
  @IsUUID('4', { message: 'Choose or add the customer for this bill' }) customerId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
  /** TAX_INVOICE (default) or ESTIMATE (non-GST quotation) */
  @IsOptional() @IsEnum(BillType) billType?: BillType;
  @IsOptional() @IsNumber() @Min(0) oldGoldWeightG?: number;
  @IsOptional() @IsNumber() @Min(0) oldGoldRatePerGram?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() isInterstate?: boolean;
  @IsOptional() @IsEnum(PaymentMode) paymentMode?: PaymentMode;
  @IsOptional() @IsNumber() @Min(0) paymentAmount?: number;
}

export class RecordPaymentDto {
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(PaymentMode) mode: PaymentMode;
  @IsOptional() @IsString() reference?: string;
}

export class PreviewInvoiceDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
  @IsOptional() @IsEnum(BillType) billType?: BillType;
  @IsOptional() @IsNumber() @Min(0) oldGoldWeightG?: number;
  @IsOptional() @IsNumber() @Min(0) oldGoldRatePerGram?: number;
  @IsOptional() isInterstate?: boolean;
}

export class CreateCustomerDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @Matches(/^[6-9]\d{9}$/, { message: 'Enter a valid 10-digit mobile number' }) phone: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() panNumber?: string;
}
