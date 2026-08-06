import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { AttributionService } from './attribution.service';

const PROTOCOL_FEE_RATE = 0.10;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

interface RevenueShareResult {
  object: string;
  partner_id: string;
  partner_name: string;
  revenue_share_pct: number;
  protocol_fee_rate: number;
  tvl: number;
  protocol_blend_apy: number;
  annual: { yield: number; protocol_fees: number; partner_revenue: number };
  daily: { yield: number; protocol_fees: number; partner_revenue: number };
  as_of: string;
}

@Injectable()
export class RevenueService {
  constructor(
    private readonly store: StoreService,
    private readonly attribution: AttributionService,
  ) {}

  async calculateRevenueShare(partnerId: string): Promise<RevenueShareResult | null> {
    const partner = await this.store.get<any>('partners', partnerId);
    if (!partner) return null;
    const tvlData = await this.attribution.getNetTVL(partnerId);
    const blendApy = await this.computeBlendApy();
    const tvl = tvlData.tvl;
    const sharePct = partner.revenue_share_pct as number;
    const annualYield = round2(tvl * blendApy);
    const dailyYield = round6(annualYield / 365);
    const annualProtocolFees = round2(annualYield * PROTOCOL_FEE_RATE);
    const dailyProtocolFees = round6(annualProtocolFees / 365);
    const annualPartnerRevenue = round2(annualProtocolFees * sharePct);
    const dailyPartnerRevenue = round6(annualPartnerRevenue / 365);
    return {
      object: 'revenue_share',
      partner_id: partnerId,
      partner_name: partner.name as string,
      revenue_share_pct: sharePct,
      protocol_fee_rate: PROTOCOL_FEE_RATE,
      tvl,
      protocol_blend_apy: blendApy,
      annual: { yield: annualYield, protocol_fees: annualProtocolFees, partner_revenue: annualPartnerRevenue },
      daily: { yield: dailyYield, protocol_fees: dailyProtocolFees, partner_revenue: dailyPartnerRevenue },
      as_of: new Date().toISOString(),
    };
  }

  private async computeBlendApy(): Promise<number> {
    const vaults = await this.store.filter<any>('vaults', (v) => v.status === 'active');
    if (vaults.length === 0) return 0;
    const totalAlloc = vaults.reduce((s: number, v: any) => s + ((v.allocation_pct as number) || 0), 0);
    if (totalAlloc > 0) {
      return Math.round(
        (vaults.reduce((s: number, v: any) => s + (v.apy as number) * ((v.allocation_pct as number) || 0), 0) / totalAlloc) * 10000,
      ) / 10000;
    }
    return Math.round(
      (vaults.reduce((s: number, v: any) => s + (v.apy as number), 0) / vaults.length) * 10000,
    ) / 10000;
  }
}
