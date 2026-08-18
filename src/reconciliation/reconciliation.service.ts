import { Injectable, Logger } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { MonitorClient } from './monitor.client';
import { DAY_MS, accrue, round2 } from '../common/accrual';

/** Recorded/observed gap that still counts as reconciled, in basis points. */
const TOLERANCE_BPS = Number(process.env.RECONCILIATION_TOLERANCE_BPS ?? 10);

interface PositionRow {
  id: string;
  user_id: string;
  partner_id: string | null;
  wallet: string;
  asset: string;
  chain: string;
  vault_id: string;
  principal: number;
  apy: number;
  status: string;
  opened_at: string;
  updated_at: string;
}

interface PositionEventRow {
  id: string;
  position_id: string;
  type: string;
  at: string;
  amount: number;
  apy: number | null;
  vault_id: string | null;
  note: string | null;
}

interface VaultRow {
  id: string;
  name: string;
  provider: string;
  asset: string;
  chain: string;
  status: string;
}

export interface ReconciliationRow {
  asset: string;
  recorded: number;
  /** null when monitoring could not supply the chain side for this asset. */
  onchain: number | null;
  discrepancy: number | null;
  diff_bps: number | null;
  observed: boolean;
}

/**
 * One shape whether or not the observed side is available, so the portal has a
 * single contract to render: an unavailable report nulls the chain fields and
 * says why rather than switching to a different payload.
 */
export interface ReconciliationReport {
  object: 'reconciliation';
  as_of: string;
  scope: string;
  status: 'reconciled' | 'mismatch' | 'unavailable';
  unavailable_reason?: string;
  recorded_total: number;
  onchain_total: number | null;
  discrepancy: number | null;
  diff_bps: number | null;
  tolerance_bps: number;
  positions: number;
  observed_at: string | null;
  observed_networks: string[];
  breakdown: ReconciliationRow[];
  open_discrepancies: ReconciliationRow[];
}

export interface ReconciliationScope {
  partnerId: string | null;
  userId?: string;
  positionId?: string;
  asset?: string;
  type?: string;
}

/**
 * Internal accounting vs the chain.
 *
 * `balances`, `ledger` and `snapshots` describe what we have recorded — they
 * come straight from positions and position events. `report` is the only one
 * that needs the other side of the comparison and pulls observed vault
 * balances from the monitoring service.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly store: StoreService,
    private readonly monitor: MonitorClient,
  ) {}

  private normalizeAsset(asset?: string): string | undefined {
    return asset ? asset.toUpperCase() : undefined;
  }

  private async positions(scope: ReconciliationScope): Promise<PositionRow[]> {
    const asset = this.normalizeAsset(scope.asset);
    return this.store.filter<PositionRow & Record<string, unknown>>(
      'positions',
      (p) =>
        (!scope.partnerId || p.partner_id === scope.partnerId) &&
        (!scope.userId || p.user_id === scope.userId) &&
        (!scope.positionId || p.id === scope.positionId) &&
        (!asset || p.asset === asset),
    );
  }

  async balances(scope: ReconciliationScope) {
    const positions = (await this.positions(scope)).filter((p) => p.status === 'active');
    const byKey = new Map<string, Record<string, number | string | null>>();
    for (const position of positions) {
      const live = accrue(position);
      const key = `${position.user_id || 'unassigned'}:${position.asset}`;
      const entry = (byKey.get(key) ?? {
        object: 'balance',
        user_id: position.user_id || null,
        asset: position.asset,
        principal: 0,
        current_value: 0,
        accrued_yield: 0,
        positions: 0,
      }) as Record<string, number | string | null>;
      entry.principal = round2((entry.principal as number) + position.principal);
      entry.current_value = round2((entry.current_value as number) + live.current_value);
      entry.accrued_yield = round2((entry.accrued_yield as number) + live.accrued_yield);
      entry.positions = (entry.positions as number) + 1;
      byKey.set(key, entry);
    }
    return [...byKey.values()];
  }

  async ledger(scope: ReconciliationScope) {
    const positions = await this.positions(scope);
    const positionById = new Map(positions.map((p) => [p.id, p]));
    if (!positionById.size) return [];

    const events = (
      await this.store.filter<PositionEventRow & Record<string, unknown>>('positionEvents', (e) =>
        positionById.has(e.position_id),
      )
    ).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const running = new Map<string, number>();
    const entries = events
      .filter((e) => ['deposit', 'withdraw', 'close'].includes(e.type))
      .map((event) => {
        const position = positionById.get(event.position_id) as PositionRow;
        const sign = event.type === 'deposit' ? 1 : -1;
        const amount = round2(sign * event.amount);
        const balance = round2((running.get(event.position_id) ?? 0) + amount);
        running.set(event.position_id, balance);
        return {
          id: `led_${event.id}`,
          object: 'ledger_entry',
          user_id: position.user_id || null,
          position_id: position.id,
          wallet: position.wallet,
          asset: position.asset,
          vault_id: event.vault_id ?? position.vault_id,
          at: event.at,
          type: event.type,
          amount,
          balance_after: balance,
          settled: true,
          ref: event.id,
        };
      });

    // Accrual row per position: closes the gap between settled movements and
    // the position's current value, so balance_after ends at what we report.
    for (const position of positions) {
      const live = accrue(position);
      const settled = running.get(position.id) ?? 0;
      const accrued = round2(live.current_value - settled);
      if (Math.abs(accrued) < 0.005) continue;
      entries.push({
        id: `led_${position.id}_accrual`,
        object: 'ledger_entry',
        user_id: position.user_id || null,
        position_id: position.id,
        wallet: position.wallet,
        asset: position.asset,
        vault_id: position.vault_id,
        at: position.updated_at,
        type: 'accrual',
        amount: accrued,
        balance_after: round2(settled + accrued),
        // Yield on an open position is unrealized until it settles on-chain.
        settled: position.status !== 'active',
        ref: position.id,
      });
    }

    const filtered = scope.type ? entries.filter((e) => e.type === scope.type) : entries;
    return filtered.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }

  async snapshots(scope: ReconciliationScope & { from?: string; to?: string }) {
    const positions = (await this.positions(scope)).filter((p) => p.principal > 0);
    const now = Date.now();
    const toMs = scope.to ? Date.parse(scope.to) : now;
    const fromMs = scope.from ? Date.parse(scope.from) : toMs - 29 * DAY_MS;
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return [];

    const out = [];
    for (let day = Math.floor(fromMs / DAY_MS) * DAY_MS; day <= toMs; day += DAY_MS) {
      const byAsset = new Map<string, { asset: string; principal: number; value: number }>();
      const users = new Set<string>();
      let open = 0;
      for (const position of positions) {
        if (Date.parse(String(position.opened_at)) > day) continue;
        const value = accrue(position, day).current_value;
        const entry = byAsset.get(position.asset) ?? { asset: position.asset, principal: 0, value: 0 };
        entry.principal = round2(entry.principal + position.principal);
        entry.value = round2(entry.value + value);
        byAsset.set(position.asset, entry);
        open += 1;
        if (position.user_id) users.add(position.user_id);
      }
      const assets = [...byAsset.values()];
      out.push({
        object: 'balance_snapshot',
        date: new Date(day).toISOString().slice(0, 10),
        t: day,
        principal: round2(assets.reduce((s, a) => s + a.principal, 0)),
        value: round2(assets.reduce((s, a) => s + a.value, 0)),
        accrued: round2(assets.reduce((s, a) => s + (a.value - a.principal), 0)),
        positions: open,
        users: users.size,
        by_asset: assets.map((a) => ({ ...a, accrued: round2(a.value - a.principal) })),
      });
    }
    return out;
  }

  /**
   * Recorded accounting vs observed on-chain balances, per asset and venue.
   *
   * Protocol-wide by design: a partner holds a slice of each vault, so
   * comparing one partner's recorded value against a whole vault's on-chain
   * balance would always look like a huge discrepancy.
   */
  async report(scope: { asset?: string } = {}): Promise<ReconciliationReport> {
    const asset = this.normalizeAsset(scope.asset);
    const positions = await this.store.filter<PositionRow & Record<string, unknown>>(
      'positions',
      (p) => p.status === 'active' && (!asset || p.asset === asset),
    );
    const vaults = await this.store.filter<VaultRow & Record<string, unknown>>('vaults', () => true);
    const vaultById = new Map(vaults.map((v) => [v.id, v]));

    // Recorded side: our own accounting, grouped the way the chain groups it.
    const recordedByVault = new Map<string, { asset: string; recorded: number; positions: number }>();
    let recordedTotal = 0;
    for (const position of positions) {
      const value = accrue(position).current_value;
      recordedTotal = round2(recordedTotal + value);
      const entry = recordedByVault.get(position.vault_id) ?? {
        asset: position.asset,
        recorded: 0,
        positions: 0,
      };
      entry.recorded = round2(entry.recorded + value);
      entry.positions += 1;
      recordedByVault.set(position.vault_id, entry);
    }

    if (!this.monitor.configured) {
      return this.unavailableReport(recordedTotal, recordedByVault, vaultById, 'MONITOR_API_URL is not configured');
    }

    let observed;
    try {
      observed = await this.monitor.observed();
    } catch (error) {
      this.logger.warn(`Observed balances unavailable: ${error}`);
      return this.unavailableReport(recordedTotal, recordedByVault, vaultById, String(error));
    }

    // Observed side keys on (asset, venue name) — vault ids are ours, the
    // chain only knows addresses — so the comparison is per asset per venue.
    const observedByAsset = new Map<string, number>();
    for (const vault of observed.vaults) {
      if (asset && vault.asset !== asset) continue;
      observedByAsset.set(vault.asset, round2((observedByAsset.get(vault.asset) ?? 0) + vault.tvl));
    }
    const recordedByAsset = new Map<string, number>();
    for (const [vaultId, entry] of recordedByVault) {
      const key = vaultById.get(vaultId)?.asset ?? entry.asset;
      recordedByAsset.set(key, round2((recordedByAsset.get(key) ?? 0) + entry.recorded));
    }

    const assets = [...new Set([...recordedByAsset.keys(), ...observedByAsset.keys()])].sort();
    const breakdown = assets.map((a) => {
      const recorded = recordedByAsset.get(a) ?? 0;
      const onchain = observedByAsset.get(a) ?? 0;
      const diff = round2(recorded - onchain);
      return {
        asset: a,
        recorded,
        onchain,
        discrepancy: diff,
        diff_bps: onchain > 0 ? round2((diff / onchain) * 10000) : null,
        observed: observedByAsset.has(a),
      };
    });

    const observedTotal = round2([...observedByAsset.values()].reduce((s, v) => s + v, 0));
    const discrepancy = round2(recordedTotal - observedTotal);
    const diffBps = observedTotal > 0 ? round2((discrepancy / observedTotal) * 10000) : null;
    const open = breakdown.filter(
      (b) => b.observed && b.diff_bps !== null && Math.abs(b.diff_bps) > TOLERANCE_BPS,
    );

    return {
      object: 'reconciliation',
      as_of: new Date().toISOString(),
      scope: asset ? `asset:${asset}` : 'protocol',
      status: open.length === 0 ? 'reconciled' : 'mismatch',
      recorded_total: recordedTotal,
      onchain_total: observedTotal,
      discrepancy,
      diff_bps: diffBps,
      tolerance_bps: TOLERANCE_BPS,
      positions: positions.length,
      observed_at: observed.fetched_at,
      observed_networks: observed.networks,
      breakdown,
      open_discrepancies: open,
    };
  }

  /** Report shape with the observed side explicitly missing, never faked. */
  private unavailableReport(
    recordedTotal: number,
    recordedByVault: Map<string, { asset: string; recorded: number; positions: number }>,
    vaultById: Map<string, VaultRow & Record<string, unknown>>,
    reason: string,
  ): ReconciliationReport {
    const recordedByAsset = new Map<string, number>();
    for (const [vaultId, entry] of recordedByVault) {
      const key = (vaultById.get(vaultId)?.asset as string) ?? entry.asset;
      recordedByAsset.set(key, round2((recordedByAsset.get(key) ?? 0) + entry.recorded));
    }
    return {
      object: 'reconciliation',
      as_of: new Date().toISOString(),
      scope: 'protocol',
      status: 'unavailable',
      unavailable_reason: reason,
      recorded_total: recordedTotal,
      onchain_total: null,
      discrepancy: null,
      diff_bps: null,
      tolerance_bps: TOLERANCE_BPS,
      positions: [...recordedByVault.values()].reduce((s, e) => s + e.positions, 0),
      observed_at: null,
      observed_networks: [],
      breakdown: [...recordedByAsset.entries()].map(([asset, recorded]) => ({
        asset,
        recorded,
        onchain: null,
        discrepancy: null,
        diff_bps: null,
        observed: false,
      })),
      open_discrepancies: [],
    };
  }
}
