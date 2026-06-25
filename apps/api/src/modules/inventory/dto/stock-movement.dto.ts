import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum StockMovementType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export class StockMovementDto {
  @IsEnum(StockMovementType)
  type: StockMovementType;

  @IsInt()
  @Min(1)
  qty: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
