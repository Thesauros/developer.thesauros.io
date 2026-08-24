import { ApiProperty } from '@nestjs/swagger';

export class VaultDto {
  @ApiProperty({ example: 'vault' })
  object: string;

  @ApiProperty({ example: 'vault_aave_base_usdc' })
  id: string;

  @ApiProperty({ example: 'Aave V3 USDC Core' })
  name: string;

  @ApiProperty({ example: 'aave' })
  provider: string;

  @ApiProperty({ enum: ['USDC', 'USDT0'] })
  asset: string;

  @ApiProperty({ example: 'base' })
  chain: string;

  @ApiProperty({ example: 0.052, description: 'Current APY as a fraction.' })
  apy: number;

  @ApiProperty({
    nullable: true,
    example: 0.0511,
    description: 'Mean of observed hourly snapshots over 7 days. null until observations exist.',
  })
  apy_7d_avg: number | null;

  @ApiProperty({ nullable: true, example: 0.0498, description: 'Same over 30 days.' })
  apy_30d_avg: number | null;

  @ApiProperty({ example: 48200000 })
  tvl_usd: number;

  @ApiProperty({ example: 120000000 })
  capacity_usd: number;

  @ApiProperty({ enum: ['bluechip', 'core', 'opportunistic'] })
  risk_tier: string;

  @ApiProperty({ enum: ['active', 'paused'] })
  status: string;

  @ApiProperty({ example: 0.28 })
  allocation_pct: number;
}

export class ApyHistoryPointDto {
  @ApiProperty({ example: 1787918400000, description: 'Epoch ms of the observation.' })
  t: number;

  @ApiProperty({ example: 0.052 })
  apy: number;
}

export class ApyHistoryDto {
  @ApiProperty({ example: 'apy_history' })
  object: string;

  @ApiProperty({ example: 'vault_aave_base_usdc' })
  vault_id: string;

  @ApiProperty({ nullable: true, example: 'Aave V3 USDC Core' })
  name: string | null;

  @ApiProperty({ nullable: true, enum: ['USDC', 'USDT0'] })
  asset: string | null;

  @ApiProperty({ nullable: true, example: 'base' })
  chain: string | null;

  @ApiProperty({ example: 7 })
  days: number;

  @ApiProperty({ nullable: true, example: 0.0511, description: 'Mean over the window. null with no observations.' })
  apy_avg: number | null;

  @ApiProperty({ example: 168 })
  observations: number;

  @ApiProperty({ type: [ApyHistoryPointDto] })
  points: ApyHistoryPointDto[];
}
