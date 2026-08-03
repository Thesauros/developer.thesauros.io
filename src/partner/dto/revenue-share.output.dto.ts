import { ApiProperty } from '@nestjs/swagger';

class RevenueTimescaleDto {
  @ApiProperty({ example: 4820 })
  yield: number;

  @ApiProperty({ example: 482 })
  protocol_fees: number;

  @ApiProperty({ example: 72.3 })
  partner_revenue: number;
}

export class RevenueShareOutputDto {
  @ApiProperty({ example: 'revenue_share' })
  object: string;

  @ApiProperty({ example: 'ptn_seed_acme' })
  partner_id: string;

  @ApiProperty({ example: 'Acme Wallet' })
  partner_name: string;

  @ApiProperty({ example: 0.15 })
  revenue_share_pct: number;

  @ApiProperty({ example: 0.1 })
  protocol_fee_rate: number;

  @ApiProperty({ example: 85420.5 })
  tvl: number;

  @ApiProperty({ example: 0.0565 })
  blend_apy: number;

  @ApiProperty({ type: RevenueTimescaleDto })
  annual: RevenueTimescaleDto;

  @ApiProperty({ type: RevenueTimescaleDto })
  daily: RevenueTimescaleDto;

  @ApiProperty()
  as_of: string;
}
