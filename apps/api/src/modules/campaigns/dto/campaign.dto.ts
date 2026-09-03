import {
  IsString, IsEnum, IsOptional, IsObject,
  IsDateString, IsArray, IsBoolean, IsUUID, MinLength,
} from 'class-validator';

export class CreateTemplateDto {
  @IsString() @MinLength(2) name: string;
  @IsString() @MinLength(2) displayName: string;
  @IsString() @MinLength(1) bodyText: string;
  @IsArray() @IsString({ each: true }) variables: string[];
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() language?: string;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() bodyText?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) variables?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CreateCampaignDto {
  @IsString() @MinLength(2) name: string;
  @IsUUID() templateId: string;
  @IsEnum(['ONCE', 'DAILY', 'WEEKLY']) scheduleType: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() cronExpr?: string;
  @IsOptional() @IsObject() audienceFilter?: Record<string, any>;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(['ONCE', 'DAILY', 'WEEKLY']) scheduleType?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsObject() audienceFilter?: Record<string, any>;
}

export class ListCampaignsDto {
  @IsOptional() @IsString() status?: string;
}
