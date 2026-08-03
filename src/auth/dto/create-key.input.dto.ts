import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsArray, MinLength } from 'class-validator';

export class CreateKeyInputDto {
  @ApiProperty({ example: 'My integration key' })
  @IsString()
  @MinLength(1)
  label: string;

  @ApiPropertyOptional({ enum: ['test', 'live'], default: 'test' })
  @IsOptional()
  @IsIn(['test', 'live'])
  environment?: string;

  @ApiPropertyOptional({ example: ['read', 'write'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiPropertyOptional({ example: 'ptn_seed_acme', description: 'Bind key to a partner for scoped access' })
  @IsOptional()
  @IsString()
  partner_id?: string;
}
