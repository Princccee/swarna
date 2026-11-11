import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsNumber, Max, Min, ValidateNested } from 'class-validator';
import { Purity } from '@svarna/shared-types';

export class ManualRateEntryDto {
  @IsEnum(Purity) purity: Purity;

  /** INR per 10 grams */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(10)
  @Max(10_000_000)
  ratePer10g: number;
}

export class SetManualRatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualRateEntryDto)
  rates: ManualRateEntryDto[];
}
