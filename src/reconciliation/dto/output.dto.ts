import { ApiProperty } from '@nestjs/swagger';

export class BalanceDto {
  @ApiProperty({ example: 'balance' })
  object: string;

  @ApiProperty({ nullable: true, example: 'usr_seed_nova' })
  user_id: string | null;

  @ApiProperty({ enum: ['USDC', 'USDT0'] })
  asset: string;

  @ApiProperty({ example: 75000 })
  principal: number;

  @ApiProperty({ example: 75526.5 })
  current_value: number;

  @ApiProperty({ example: 526.5 })
  accrued_yield: number;

  @ApiProperty({ example: 2, description: 'Active positions folded into this row.' })
  positions: number;
}

export class LedgerEntryDto {
  @ApiProperty({ example: 'led_evt_seed_alpha_dep' })
  id: string;

  @ApiProperty({ example: 'ledger_entry' })
  object: string;

  @ApiProperty({ nullable: true, example: 'usr_seed_nova' })
  user_id: string | null;

  @ApiProperty({ example: 'pos_seed_alpha' })
  position_id: string;

  @ApiProperty({ example: '0x8a3f1c9e2b7d4065a1c8e9f0b2d4c6a8e1f3b5d7' })
  wallet: string;

  @ApiProperty({ enum: ['USDC', 'USDT0'] })
  asset: string;

  @ApiProperty({ example: 'vault_aave_base_usdc' })
  vault_id: string;

  @ApiProperty({ example: '2026-06-20T12:00:00.000Z' })
  at: string;

  @ApiProperty({ enum: ['deposit', 'withdraw', 'close', 'accrual'] })
  type: string;

  @ApiProperty({ example: 25000, description: 'Signed: withdrawals and closes are negative.' })
  amount: number;

  @ApiProperty({ example: 25000, description: 'Running balance for this position after the row.' })
  balance_after: number;

  @ApiProperty({
    example: true,
    description: 'false for accrual on an open position — unrealized until it settles on-chain.',
  })
  settled: boolean;

  @ApiProperty({ example: 'evt_seed_alpha_dep', description: 'Source event id.' })
  ref: string;
}

export class SnapshotAssetDto {
  @ApiProperty({ enum: ['USDC', 'USDT0'] })
  asset: string;

  @ApiProperty({ example: 75000 })
  principal: number;

  @ApiProperty({ example: 75526.5 })
  value: number;

  @ApiProperty({ example: 526.5 })
  accrued: number;
}

export class BalanceSnapshotDto {
  @ApiProperty({ example: 'balance_snapshot' })
  object: string;

  @ApiProperty({ example: '2026-08-24' })
  date: string;

  @ApiProperty({ example: 1787918400000, description: 'Epoch ms of the day boundary.' })
  t: number;

  @ApiProperty({ example: 85000 })
  principal: number;

  @ApiProperty({ example: 85618.06 })
  value: number;

  @ApiProperty({ example: 618.06 })
  accrued: number;

  @ApiProperty({ example: 3 })
  positions: number;

  @ApiProperty({ example: 2 })
  users: number;

  @ApiProperty({ type: [SnapshotAssetDto] })
  by_asset: SnapshotAssetDto[];
}

export class ReconciliationRowDto {
  @ApiProperty({ enum: ['USDC', 'USDT0'] })
  asset: string;

  @ApiProperty({ example: 75526.5 })
  recorded: number;

  @ApiProperty({ nullable: true, example: 75530.1, description: 'null when monitoring could not supply this asset.' })
  onchain: number | null;

  @ApiProperty({ nullable: true, example: -3.6 })
  discrepancy: number | null;

  @ApiProperty({ nullable: true, example: -0.48, description: 'Discrepancy in basis points of the chain balance.' })
  diff_bps: number | null;

  @ApiProperty({ example: true })
  observed: boolean;
}

export class ReconciliationReportDto {
  @ApiProperty({ example: 'reconciliation' })
  object: string;

  @ApiProperty()
  as_of: string;

  @ApiProperty({ example: 'protocol' })
  scope: string;

  @ApiProperty({
    enum: ['reconciled', 'mismatch', 'unavailable'],
    description: '"unavailable" when MONITOR_API_URL is unset or monitoring is unreachable.',
  })
  status: string;

  @ApiProperty({ required: false, example: 'MONITOR_API_URL is not configured' })
  unavailable_reason?: string;

  @ApiProperty({ example: 85618.06 })
  recorded_total: number;

  @ApiProperty({ nullable: true, example: 85620.4 })
  onchain_total: number | null;

  @ApiProperty({ nullable: true, example: -2.34 })
  discrepancy: number | null;

  @ApiProperty({ nullable: true, example: -0.27 })
  diff_bps: number | null;

  @ApiProperty({ example: 10, description: 'RECONCILIATION_TOLERANCE_BPS.' })
  tolerance_bps: number;

  @ApiProperty({ example: 3 })
  positions: number;

  @ApiProperty({ nullable: true, example: '2026-08-24T10:00:00.000Z' })
  observed_at: string | null;

  @ApiProperty({ type: [String], example: ['arbitrumRebalancer', 'plasma'] })
  observed_networks: string[];

  @ApiProperty({ type: [ReconciliationRowDto] })
  breakdown: ReconciliationRowDto[];

  @ApiProperty({ type: [ReconciliationRowDto], description: 'Rows past the tolerance.' })
  open_discrepancies: ReconciliationRowDto[];
}
