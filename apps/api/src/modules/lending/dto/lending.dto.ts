import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsNumber, IsOptional,
  IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Purity } from '@svarna/shared-types';

export const LENDABLE_PURITIES = [
  Purity.GOLD_24K, Purity.GOLD_22K, Purity.GOLD_18K, Purity.GOLD_14K, Purity.SILVER_999, Purity.SILVER_925,
] as const;

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'NET_BANKING', 'CHEQUE'] as const;

export class LoanItemDto {
  @IsString() @MinLength(1) @MaxLength(120) description: string;
  @IsIn(LENDABLE_PURITIES as unknown as string[]) purity: Purity;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) grossWeightG: number;
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) netWeightG: number;
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class NewCustomerDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @Matches(/^\d{10}$/, { message: 'phone must be a 10-digit mobile number' }) phone: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}

export class ValuationDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30)
  @ValidateNested({ each: true }) @Type(() => LoanItemDto)
  items: LoanItemDto[];
}

export class CreateLoanDto extends ValuationDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @ValidateNested() @Type(() => NewCustomerDto) newCustomer?: NewCustomerDto;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) amount: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) monthlyRatePct?: number;
  /** Owner only — staff loans are dated now. */
  @IsOptional() @IsDateString() loanDate?: string;
  @IsOptional() @IsIn(PAYMENT_MODES as unknown as string[]) disbursedMode?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  /** Required when the amount is above the maximum loan-to-value %. */
  @IsOptional() @IsBoolean() confirmAboveMaxLtv?: boolean;
}

export class PaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  /** Owner only — staff payments are dated now. */
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsIn(PAYMENT_MODES as unknown as string[]) mode?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class PledgeDto {
  @IsString() @MinLength(2) @MaxLength(120) merchantName: string;
  @IsOptional() @IsString() @MaxLength(20) merchantPhone?: string;
  @IsOptional() @IsDateString() pledgedAt?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) amount: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ForfeitDto {
  @IsEnum({ KEPT: 'KEPT', SOLD: 'SOLD' }) outcome: 'KEPT' | 'SOLD';
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ListLoansDto {
  @IsOptional() @IsIn(['active', 'overdue', 'merchant', 'closed', 'all']) tab?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
