import {
  IsBoolean, IsDecimal, IsEnum, IsOptional, IsString,
  IsUUID, Matches, MaxLength, MinLength,
} from 'class-validator';
import { Purity } from '@svarna/shared-types';

export class CreateItemDto {
  @IsUUID()
  categoryId: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9-]+$/, { message: 'SKU must be uppercase alphanumeric with hyphens' })
  @MaxLength(32)
  sku?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsEnum(Purity)
  purity: Purity;

  @IsDecimal({ decimal_digits: '0,3', force_decimal: false })
  grossWeightG: string;

  @IsDecimal({ decimal_digits: '0,3', force_decimal: false })
  netWeightG: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,3', force_decimal: false })
  stoneWeightG?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{6}$/, { message: 'HUID must be exactly 6 alphanumeric characters' })
  huid?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  makingPct?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  makingPerGram?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  stoneValue?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  catalogueVisible?: boolean;
}
