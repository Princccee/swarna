import { IsOptional, IsString, Matches } from 'class-validator';

export class RegisterHuidDto {
  @IsString()
  @Matches(/^[A-Z0-9]{6}$/, { message: 'HUID must be exactly 6 alphanumeric characters' })
  huid: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
