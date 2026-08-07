import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreService } from '../store/store.service';

const HISTORY_DAYS = 30;

export interface YieldHistoryPoint {
  t: number;
  apy: number;
}

export interface YieldHistory {
  object: 'yield_history';
  /** Always "protocol": this series is protocol-wide, never partner-attributed. */
  scope: 'protocol';
  asset: string;
  blend_apy: number;
  history: YieldHistoryPoint[];
}

/**
 * Protocol-level yield reference data. Deliberately takes no partner input —
 * the blended APY of a Thesauros asset is the same number for every caller.
 */
@Injectable()
export class YieldService {
  constructor(private readonly store: StoreService) {}

  async getAssetHistory(asset: string): Promise<YieldHistory> {
    const symbol = asset.toUpperCase();
    const vaults = await this.store.filter<any>(
      'vaults',
      (v) => v.asset === symbol && v.status === 'active',
    );
    if (vaults.length === 0) {
      throw new NotFoundException(`Unsupported asset "${asset}".`);
    }
    const blendApy = this.blendApy(vaults);
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const history = Array.from({ length: HISTORY_DAYS }, (_, i) => {
      const drift = (this.seededUnit(`yieldhist:${symbol}:${i}`) - 0.5) * 0.01;
      return {
        t: now - (HISTORY_DAYS - 1 - i) * dayMs,
        apy: round4(Math.max(0, blendApy + drift)),
      };
    });
    return {
      object: 'yield_history',
      scope: 'protocol',
      asset: symbol,
      blend_apy: round4(blendApy),
      history,
    };
  }

  private blendApy(vaults: any[]): number {
    const totalAlloc = vaults.reduce((s, v) => s + ((v.allocation_pct as number) || 0), 0);
    if (totalAlloc > 0) {
      return (
        vaults.reduce((s, v) => s + (v.apy as number) * ((v.allocation_pct as number) || 0), 0) /
        totalAlloc
      );
    }
    return vaults.reduce((s, v) => s + (v.apy as number), 0) / vaults.length;
  }

  /** Deterministic [0,1) from a seed string — sandbox history is reproducible. */
  private seededUnit(seed: string): number {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    let a = (h ^= h >>> 16) >>> 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
