import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PartnerOutputDto {
  @ApiProperty({ example: 'ptn_a1b2c3d4e5f60718' })
  id: string;

  @ApiProperty({ example: 'partner' })
  object: string;

  @ApiProperty({ example: 'Acme Wallet' })
  name: string;

  @ApiProperty({ example: 'acme-wallet' })
  slug: string;

  @ApiPropertyOptional({ example: 'dev@acmewallet.io', nullable: true })
  contact_email: string | null;

  @ApiPropertyOptional({ nullable: true })
  webhook_url: string | null;

  @ApiProperty({ example: 0.15 })
  revenue_share_pct: number;

  @ApiProperty({ example: 'active', enum: ['active', 'disabled'] })
  status: string;

  @ApiPropertyOptional({ example: {} })
  metadata: Record<string, unknown>;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

export class CampaignOutputDto {
  @ApiProperty({ example: 'cmp_a1b2c3d4e5f60718' })
  id: string;

  @ApiProperty({ example: 'campaign' })
  object: string;

  @ApiProperty({ example: 'ptn_seed_acme' })
  partner_id: string;

  @ApiProperty({ example: 'Summer 2026 Launch' })
  name: string;

  @ApiProperty({ example: 'summer-2026' })
  slug: string;

  @ApiPropertyOptional({ nullable: true })
  utm_source: string | null;

  @ApiPropertyOptional({ nullable: true })
  utm_medium: string | null;

  @ApiProperty({ example: 'active', enum: ['active', 'paused'] })
  status: string;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}
