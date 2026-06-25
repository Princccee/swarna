import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { Metal, Purity } from '@svarna/shared-types';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryRateHistoryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(Metal)
  metal?: Metal;

  @IsOptional()
  @IsEnum(Purity)
  purity?: Purity;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
