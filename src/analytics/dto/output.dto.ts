import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const WITHHELD = 'null while `insufficient_history` is true — withheld rather than estimated.';

export class SignalDto {
  @ApiProperty({ example: 'signal' })
  object: string;

  @ApiProperty({ example: 'vault_plasma_usdt0' })
  vault_id: string;

  @ApiProperty({ example: 'Thesauros USDT0 Vault' })
  name: string;

  @ApiProperty({ example: 'morpho' })
  provider: string;

  @ApiProperty({ enum: ['USDC', 'USDT0'], example: 'USDT0' })
  asset: string;

  @ApiProperty({ example: 'plasma' })
  chain: string;

  @ApiProperty({ enum: ['bluechip', 'core', 'opportunistic'], example: 'core' })
  risk_tier: string;

  @ApiProperty({ example: 0.076, description: 'Current APY as a fraction (0.076 = 7.6%).' })
  apy: number;

  @ApiProperty({ nullable: true, example: 0.0012, description: `Stddev of observed APY. ${WITHHELD}` })
  volatility: number | null;

  @ApiProperty({ nullable: true, example: 3.4, description: `Trend in bps/day. ${WITHHELD}` })
  trend_slope_bps_day: number | null;

  @ApiProperty({ nullable: true, example: 0.079, description: `7-day extrapolation. ${WITHHELD}` })
  forecast_apy: number | null;

  @ApiProperty({ example: 0.92, description: 'Risk multiplier implied by risk_tier.' })
  risk_factor: number;

  @ApiProperty({ example: 0.0699, description: 'apy * risk_factor - 0.5 * volatility.' })
  risk_adjusted_apy: number;

  @ApiProperty({ example: 6, description: 'Hourly APY snapshots behind these statistics.' })
  observations: number;

  @ApiProperty({ example: false, description: 'True when fewer than 3 observations exist.' })
  insufficient_history: boolean;

  @ApiProperty({ example: 1, description: '1 = best risk-adjusted venue.' })
  rank: number;

  @ApiProperty({ enum: ['overweight', 'neutral', 'underweight'], example: 'overweight' })
  recommendation: string;
}

export class RegimePerAssetDto {
  @ApiProperty({ enum: ['USDC', 'USDT0'] })
  asset: string;

  @ApiProperty({ enum: ['rising', 'falling', 'volatile', 'stable', 'unknown'], example: 'stable' })
  regime: string;

  @ApiProperty({ nullable: true, example: 0.0526, description: 'Allocation-weighted blend, latest observation.' })
  blend_apy: number | null;

  @ApiProperty({ nullable: true, example: -0.8 })
  trend_slope_bps_day: number | null;

  @ApiProperty({ nullable: true, example: 0.0009 })
  volatility: number | null;

  @ApiProperty({ example: 12 })
  observations: number;
}

export class RegimeDto {
  @ApiProperty({ example: 'regime' })
  object: string;

  @ApiProperty({ example: '2026-08-24T10:00:00.000Z' })
  as_of: string;

  @ApiProperty({
    enum: ['rising', 'falling', 'volatile', 'stable', 'unknown'],
    description: 'Most cautious classification across assets; "unknown" until enough history exists.',
  })
  regime: string;

  @ApiProperty({ example: 'Rates are range-bound; optimize on risk-adjusted carry and low turnover.' })
  description: string;

  @ApiProperty({ type: [RegimePerAssetDto] })
  per_asset: RegimePerAssetDto[];
}

export class UpliftRowDto {
  @ApiProperty({ example: 'uplift_row' })
  object: string;

  @ApiProperty({ example: 'pos_seed_alpha' })
  position_id: string;

  @ApiProperty({ nullable: true, example: 'usr_seed_nova' })
  user_id: string | null;

  @ApiProperty({ enum: ['USDC', 'USDT0'] })
  asset: string;

  @ApiProperty({ example: 'vault_aave_base_usdc' })
  vault_id: string;

  @ApiProperty({ example: 25000 })
  principal: number;

  @ApiProperty({ example: 25342.19 })
  current_value: number;

  @ApiProperty({ example: 0.052 })
  apy: number;

  @ApiProperty({
    nullable: true,
    example: 25180.4,
    description: 'Value under the passive baseline venue. null when the asset has no baseline venue.',
  })
  aave_baseline: number | null;

  @ApiProperty({ example: 'aave', description: 'Baseline venue provider (ANALYTICS_BASELINE_PROVIDER).' })
  baseline_provider: string;

  @ApiProperty({ nullable: true, example: 0.052 })
  baseline_apy: number | null;

  @ApiProperty({ example: 25342.19, description: 'Value had the position stayed in its origin vault.' })
  hold_baseline: number;

  @ApiProperty({ nullable: true, example: 161.79 })
  uplift_vs_aave: number | null;

  @ApiProperty({ example: 0 })
  uplift_vs_hold: number;

  @ApiProperty({ nullable: true, example: 161.79, description: 'Accrued so far vs the baseline.' })
  realized_uplift: number | null;

  @ApiProperty({ nullable: true, example: 800, description: "Today's APY spread annualised over principal." })
  projected_uplift_annual: number | null;
}

export class UpliftTotalsDto {
  @ApiProperty({ example: 85000 })
  principal: number;

  @ApiProperty({ example: 85618.06 })
  current_value: number;

  @ApiProperty({ example: 75452.04 })
  aave_baseline: number;

  @ApiProperty({ example: 85618.06 })
  hold_baseline: number;

  @ApiProperty({ example: 74.46 })
  uplift_vs_aave: number;

  @ApiProperty({ example: 0 })
  uplift_vs_hold: number;

  @ApiProperty({ example: 0.0987 })
  uplift_vs_aave_pct: number;

  @ApiProperty({
    example: 0.6667,
    description: 'Share of positions whose asset has a baseline venue; the rest are excluded from baseline totals.',
  })
  baseline_coverage: number;
}

export class UpliftDto {
  @ApiProperty({ example: 'uplift' })
  object: string;

  @ApiProperty()
  as_of: string;

  @ApiProperty({ example: 'partner:ptn_seed_acme' })
  scope: string;

  @ApiProperty({ type: UpliftTotalsDto })
  totals: UpliftTotalsDto;

  @ApiProperty({ type: [UpliftRowDto] })
  positions: UpliftRowDto[];
}

export class DecisionAlternativeDto {
  @ApiProperty({ example: 'vault_morpho_base_usdc' })
  vault_id: string;

  @ApiProperty({ example: 'Morpho Blue USDC Yield' })
  name: string;

  @ApiProperty({ example: 'morpho' })
  provider: string;

  @ApiProperty({ example: 0.068 })
  apy: number;

  @ApiProperty({ example: 'core' })
  risk_tier: string;
}

export class DecisionDto {
  @ApiProperty({ example: 'dec_evt_seed_alpha_dep' })
  id: string;

  @ApiProperty({ example: 'decision' })
  object: string;

  @ApiProperty()
  at: string;

  @ApiProperty({ example: 'pos_seed_alpha' })
  position_id: string;

  @ApiProperty({ nullable: true, example: 'usr_seed_nova' })
  user_id: string | null;

  @ApiProperty({ enum: ['USDC', 'USDT0'] })
  asset: string;

  @ApiProperty({ enum: ['initial_routing', 'rebalance'] })
  type: string;

  @ApiProperty({ nullable: true, description: 'null for initial_routing.' })
  from_vault: string | null;

  @ApiProperty({ example: 'vault_aave_base_usdc' })
  to_vault: string;

  @ApiProperty({ nullable: true, example: 0.052 })
  apy_before: number | null;

  @ApiProperty({ nullable: true, example: 0.068 })
  apy_after: number | null;

  @ApiProperty({ nullable: true, example: 160, description: 'apy_after - apy_before, in bps.' })
  expected_uplift_bps: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'rate_spread' })
  reason: string | null;

  @ApiProperty({ type: [DecisionAlternativeDto], description: 'Venues available for this asset at read time.' })
  alternatives: DecisionAlternativeDto[];

  @ApiProperty({ example: 'Routed USDC deposit to Aave V3 USDC Core at 5.20%.' })
  rationale: string;

  @ApiProperty({ example: 'executed' })
  status: string;
}

export class AdvisorOpportunityDto {
  @ApiProperty()
  vault_id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['USDC', 'USDT0'] })
  asset: string;

  @ApiProperty({ example: 0.0699 })
  risk_adjusted_apy: number;

  @ApiProperty({ nullable: true, example: 0.079 })
  forecast_apy: number | null;

  @ApiProperty({ enum: ['overweight', 'neutral', 'underweight'] })
  recommendation: string;
}

export class AdvisorPortfolioDto {
  @ApiProperty({ example: 85618.06 })
  current_value: number;

  @ApiProperty({ example: 74.46 })
  uplift_vs_aave: number;

  @ApiProperty({ example: 0.0987 })
  uplift_vs_aave_pct: number;

  @ApiProperty({ example: 3 })
  positions: number;
}

export class AdvisorDto {
  @ApiProperty({ example: 'advisor' })
  object: string;

  @ApiProperty()
  as_of: string;

  @ApiProperty({ example: 'Routing is beating the passive baseline; hold the strategy and keep monitoring the regime.' })
  headline: string;

  @ApiProperty({ enum: ['rising', 'falling', 'volatile', 'stable', 'unknown'] })
  regime: string;

  @ApiProperty({ type: [String], description: 'Plain-language findings, each traceable to a computed figure.' })
  bullets: string[];

  @ApiProperty({ type: [AdvisorOpportunityDto] })
  top_opportunities: AdvisorOpportunityDto[];

  @ApiProperty({ type: AdvisorPortfolioDto })
  portfolio: AdvisorPortfolioDto;

  @ApiProperty()
  disclaimer: string;
}
