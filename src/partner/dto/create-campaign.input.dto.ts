import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Matches, MinLength } from 'class-validator';

export class CreateCampaignInputDto {
  @ApiProperty({ example: 'Summer 2026 Launch' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'summer-2026', description: 'Unique within partner' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, { message: 'Slug: 3-50 chars, lowercase alphanumeric + hyphens.' })
  slug?: string;

  @ApiPropertyOptional({ example: 'twitter' })
  @IsOptional()
  @IsString()
  utm_source?: string;

  @ApiPropertyOptional({ example: 'cpc' })
  @IsOptional()
  @IsString()
  utm_medium?: string;
}
