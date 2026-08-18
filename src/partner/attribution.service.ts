import { Injectable } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { accrue, round2 } from '../common/accrual';

interface Attribution {
  id: string;
  object: string;
  user_id: string;
  partner_id: string;
  campaign_id: string | null;
  source: string;
  attributed_at: string;
  [key: string]: unknown;
}

interface Position {
  id: string;
  user_id: string;
  partner_id: string | null;
  wallet: string;
  asset: string;
  principal: number;
  apy: number;
  status: string;
  opened_at: string;
  updated_at: string;
  withdrawn_total: number;
  [key: string]: unknown;
}

interface User {
  id: string;
  label: string;
  wallets: string[];
  [key: string]: unknown;
}

@Injectable()
export class AttributionService {
  constructor(private readonly store: StoreService) {}

  async attributeUser(data: {
    user_id: string;
    partner_id: string;
    campaign_id?: string;
    source?: string;
  }): Promise<Attribution> {
    const existing = (await this.store.filter<Attribution>(
      'attributions',
      (a) => a.user_id === data.user_id,
    ))[0];
    if (existing) return existing;
    return this.store.create<Attribution>('attributions', {
      id: this.store.randomId('atr'),
      object: 'attribution',
      user_id: data.user_id,
      partner_id: data.partner_id,
      campaign_id: data.campaign_id ?? null,
      source: data.source ?? 'api',
      attributed_at: new Date().toISOString(),
    });
  }

  async getAttribution(userId: string): Promise<Attribution | null> {
    return (await this.store.filter<Attribution>('attributions', (a) => a.user_id === userId))[0] ?? null;
  }

  async listAttributions(partnerId: string): Promise<Attribution[]> {
    return this.store.filter<Attribution>('attributions', (a) => a.partner_id === partnerId);
  }

  async isUserAttributedToPartner(userId: string, partnerId: string): Promise<boolean> {
    const attr = await this.getAttribution(userId);
    return attr !== null && attr.partner_id === partnerId;
  }

  async getAttributedUsers(partnerId: string): Promise<(User & { attribution: Attribution | null })[]> {
    const attributions = await this.listAttributions(partnerId);
    const userIds = new Set(attributions.map((a) => a.user_id));
    const users = await this.store.filter<User>('users', (u) => userIds.has(u.id));
    return users.map((u) => ({
      ...u,
      attribution: attributions.find((a) => a.user_id === u.id) ?? null,
    }));
  }

  private async getPartnerPositions(partnerId: string): Promise<Position[]> {
    return this.store.filter<Position>('positions', (p) => p.partner_id === partnerId);
  }

  /** Shared with analytics and reconciliation so all three agree on value. */
  private withAccrual(position: Position): Position & { current_value: number; accrued_yield: number } {
    return accrue(position);
  }

  async getAttributedDeposits(partnerId: string): Promise<{
    total: number;
    count: number;
    deposits: { position_id: string; user_id: string | null; wallet: string; asset: string; principal: number; opened_at: string }[];
  }> {
    const positions = await this.getPartnerPositions(partnerId);
    const deposits = positions
      .filter((p) => p.status !== 'closed')
      .map((p) => ({
        position_id: p.id,
        user_id: p.user_id ?? null,
        wallet: p.wallet,
        asset: p.asset,
        principal: p.principal,
        opened_at: p.opened_at,
      }));
    return {
      total: round2(deposits.reduce((s, d) => s + d.principal, 0)),
      count: deposits.length,
      deposits,
    };
  }

  async getAttributedWithdrawals(partnerId: string): Promise<{ total: number; count: number }> {
    const positions = await this.getPartnerPositions(partnerId);
    let total = 0;
    let count = 0;
    for (const p of positions) {
      if (p.withdrawn_total > 0) {
        total = round2(total + p.withdrawn_total);
        count++;
      }
      if (p.status === 'closed') {
        total = round2(total + p.principal);
        count++;
      }
    }
    return { total, count };
  }

  async getNetTVL(partnerId: string): Promise<{
    tvl: number;
    breakdown: { asset: string; tvl: number; positions: number }[];
  }> {
    const positions = (await this.getPartnerPositions(partnerId)).filter((p) => p.status === 'active');
    let tvl = 0;
    const byAsset: Record<string, { asset: string; tvl: number; positions: number }> = {};
    for (const raw of positions) {
      const p = this.withAccrual(raw);
      tvl = round2(tvl + p.current_value);
      const a = (byAsset[p.asset] ??= { asset: p.asset, tvl: 0, positions: 0 });
      a.tvl = round2(a.tvl + p.current_value);
      a.positions += 1;
    }
    return { tvl, breakdown: Object.values(byAsset) };
  }

  async getAttributedYield(partnerId: string): Promise<{
    total_yield: number;
    positions: { position_id: string; asset: string; principal: number; accrued_yield: number; apy: number }[];
  }> {
    const positions = await this.getPartnerPositions(partnerId);
    let totalYield = 0;
    const details = positions.map((raw) => {
      const p = this.withAccrual(raw);
      totalYield = round2(totalYield + p.accrued_yield);
      return {
        position_id: p.id,
        asset: p.asset,
        principal: p.principal,
        accrued_yield: p.accrued_yield,
        apy: p.apy,
      };
    });
    return { total_yield: totalYield, positions: details };
  }

  async getAttributedPoints(partnerId: string): Promise<{
    total_points: number;
    users: { user_id: string; label: string; points: number }[];
  }> {
    const users = await this.getAttributedUsers(partnerId);
    let totalPoints = 0;
    const breakdown = [];
    for (const u of users) {
      const locks = await this.store.filter('locks', (l: any) =>
        u.wallets.some((w: string) => w.toLowerCase() === (l.userAddress ?? '').toLowerCase()),
      );
      let points = 0;
      for (const l of locks) {
        points += (Number((l as any).amount) || 0) * (Number((l as any).duration) || 0);
      }
      totalPoints += points;
      breakdown.push({ user_id: u.id, label: u.label, points });
    }
    return { total_points: totalPoints, users: breakdown };
  }
}
