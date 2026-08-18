import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserInputDto {
  @ApiProperty({ example: 'customer-42', description: 'Your customer id — unique per user.' })
  @IsString()
  @MinLength(1)
  external_id: string;

  @ApiPropertyOptional({ example: 'Ada L.' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 'ada@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: ['0x0000000000000000000000000000000000000001'] })
  @IsOptional()
  @IsArray()
  wallets?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
