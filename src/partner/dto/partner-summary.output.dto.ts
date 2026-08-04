import { ApiProperty } from '@nestjs/swagger';

class SummaryUsersDto {
  @ApiProperty({ example: 2 })
  total: number;
}

class SummaryDepositsDto {
  @ApiProperty({ example: 85000 })
  total: number;

  @ApiProperty({ example: 3 })
  count: number;
}

class TvlBreakdownDto {
  @ApiProperty({ example: 'USDC' })
  asset: string;

  @ApiProperty({ example: 75420.5 })
  tvl: number;

  @ApiProperty({ example: 2 })
  positions: number;
}

class SummaryTvlDto {
  @ApiProperty({ example: 85420.5 })
  total: number;

  @ApiProperty({ type: [TvlBreakdownDto] })
  breakdown: TvlBreakdownDto[];
}

class SummaryYieldDto {
  @ApiProperty({ example: 420.5 })
  total: number;
}

class SummaryPointsDto {
  @ApiProperty({ example: 0 })
  total: number;
}

class SummaryRevenueDto {
  @ApiProperty({ example: 0.15 })
  revenue_share_pct: number;

  @ApiProperty({ example: 72.31 })
  annual_partner_revenue: number;

  @ApiProperty({ example: 0.198 })
  daily_partner_revenue: number;
}

export class PartnerSummaryOutputDto {
  @ApiProperty({ example: 'partner_summary' })
  object: string;

  @ApiProperty()
  partner: { id: string; name: string; slug: string; status: string };

  @ApiProperty({ type: SummaryUsersDto })
  users: SummaryUsersDto;

  @ApiProperty({ type: SummaryDepositsDto })
  deposits: SummaryDepositsDto;

  @ApiProperty({ type: SummaryTvlDto })
  tvl: SummaryTvlDto;

  @ApiProperty({ type: SummaryYieldDto })
  yield: SummaryYieldDto;

  @ApiProperty({ type: SummaryPointsDto })
  points: SummaryPointsDto;

  @ApiProperty({ type: SummaryRevenueDto })
  revenue: SummaryRevenueDto;

  @ApiProperty()
  as_of: string;
}
