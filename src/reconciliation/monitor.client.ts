import { Injectable, Logger } from '@nestjs/common';

const REQUEST_TIMEOUT_MS = 15_000;
/** Chain reads are slow and rarely move within a few minutes. */
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface ObservedVault {
  address: string;
  name: string;
  asset: string;
  network: string;
  /** On-chain totalAssets, in whole units of the underlying asset. */
  tvl: number;
  active_provider: string | null;
}

export interface ObservedSnapshot {
  vaults: ObservedVault[];
  fetched_at: string;
  networks: string[];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    // Monitoring formats TVL for display ("1,234.56") — strip separators.
    const parsed = Number(value.replace(/[, ]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Reads observed on-chain vault balances from the monitoring service.
 *
 * Monitoring is the only component that already talks to every chain, so
 * reconciliation borrows its readings instead of opening a second set of RPC
 * connections. When it is unreachable the caller is told so — a reconciliation
 * report with a guessed "observed" side is worse than no report.
 */
@Injectable()
export class MonitorClient {
  private readonly logger = new Logger(MonitorClient.name);
  private cache: { at: number; snapshot: ObservedSnapshot } | null = null;
  private inFlight: Promise<ObservedSnapshot> | null = null;

  get configured(): boolean {
    return Boolean(process.env.MONITOR_API_URL);
  }

  private get baseUrl(): string {
    return (process.env.MONITOR_API_URL ?? '').replace(/\/+$/, '');
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`monitoring ${path} responded ${response.status}`);
    }
    return (await response.json()) as T;
  }

  /** Networks to reconcile: explicit config, else whatever monitoring lists. */
  private async networks(): Promise<string[]> {
    const configured = (process.env.MONITOR_NETWORKS ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (configured.length) return configured;
    const listed = await this.getJson<unknown>('/api/networks');
    if (!Array.isArray(listed)) return [];
    return listed
      .map((n) => (typeof n === 'string' ? n : (n as { id?: string; key?: string }).id ?? (n as { key?: string }).key))
      .filter((n): n is string => Boolean(n));
  }

  async observed(): Promise<ObservedSnapshot> {
    if (!this.configured) {
      throw new Error('MONITOR_API_URL is not configured');
    }
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.snapshot;
    }
    // Collapse concurrent callers onto one fetch: each one costs a full
    // multi-network chain read on the monitoring side.
    if (this.inFlight) return this.inFlight;

    this.inFlight = (async () => {
      const networks = await this.networks();
      const vaults: ObservedVault[] = [];
      for (const network of networks) {
        try {
          const rows = await this.getJson<Record<string, unknown>[]>(
            `/api/vaults?network=${encodeURIComponent(network)}`,
          );
          if (!Array.isArray(rows)) continue;
          for (const row of rows) {
            vaults.push({
              address: String(row.address ?? ''),
              name: String(row.name ?? ''),
              asset: String(row.symbol ?? row.asset ?? '').toUpperCase(),
              network,
              tvl: toNumber(row.tvl),
              active_provider: row.activeProvider ? String(row.activeProvider) : null,
            });
          }
        } catch (error) {
          // One unreachable chain must not void the whole report; the missing
          // network shows up as absent coverage in the report instead.
          this.logger.warn(`Observed balances unavailable for ${network}: ${error}`);
        }
      }
      const snapshot: ObservedSnapshot = {
        vaults,
        fetched_at: new Date().toISOString(),
        networks,
      };
      this.cache = { at: Date.now(), snapshot };
      return snapshot;
    })().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }
}
