import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CustomerRegisterDto {
  @IsString() name: string;
  @IsString() phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(6) password: string;
}

export class CustomerLoginDto {
  @IsString() phone: string;
  @IsString() password: string;
}

export class ReserveItemDto {
  @IsUUID() itemId: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() expectedDate?: string;
}
