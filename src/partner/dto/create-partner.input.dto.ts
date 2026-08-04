import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max, Matches, MinLength, IsEmail, IsObject } from 'class-validator';

export class CreatePartnerInputDto {
  @ApiProperty({ example: 'Acme Wallet' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'acme-wallet', description: 'URL-friendly slug (auto-generated from name if omitted)' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, { message: 'Slug must be 3-50 chars, lowercase alphanumeric + hyphens.' })
  slug?: string;

  @ApiPropertyOptional({ example: 'dev@acmewallet.io' })
  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @ApiPropertyOptional({ example: 'https://acme.io/webhooks/thesauros' })
  @IsOptional()
  @IsString()
  webhook_url?: string;

  @ApiPropertyOptional({ example: 0.15, description: 'Revenue share percentage (0–1)', default: 0.15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  revenue_share_pct?: number;

  @ApiPropertyOptional({ example: { tier: 'enterprise' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
