import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PartnerId } from '../common/decorators';
import { RequiredScope } from '../common/decorators';
import { PartnerService } from './partner.service';
import { AttributionService } from './attribution.service';
import { RevenueService } from './revenue.service';
import { StoreService } from '../store/store.service';
import { PartnerSummaryOutputDto, RevenueShareOutputDto } from './dto';

@ApiTags('Partner API (Self-Service)')
@ApiBearerAuth()
@Controller('partner')
@RequiredScope('partner:read')
export class PartnerApiController {
  constructor(
    private readonly partnerService: PartnerService,
    private readonly attribution: AttributionService,
    private readonly revenue: RevenueService,
    private readonly store: StoreService,
  ) {}

  private requirePartnerId(partnerId: string | null): string {
    if (!partnerId) {
      throw new ForbiddenException('This endpoint requires a partner-scoped API key.');
    }
    return partnerId;
  }

  @Get('summary')
  @ApiOperation({ summary: 'Partner summary' })
  @ApiOkResponse({ type: PartnerSummaryOutputDto })
  async getSummary(@PartnerId() partnerId: string | null): Promise<PartnerSummaryOutputDto> {
    const pid = this.requirePartnerId(partnerId);
    const partner = await this.partnerService.getPartner(pid);
    if (!partner) throw new NotFoundException('Partner not found.');
    const users = await this.attribution.getAttributedUsers(pid);
    const deposits = await this.attribution.getAttributedDeposits(pid);
    const tvl = await this.attribution.getNetTVL(pid);
    const yieldData = await this.attribution.getAttributedYield(pid);
    const points = await this.attribution.getAttributedPoints(pid);
    const revenueData = await this.revenue.calculateRevenueShare(pid);
    return {
      object: 'partner_summary',
      partner: { id: partner.id, name: partner.name as string, slug: partner.slug as string, status: partner.status as string },
      users: { total: users.length },
      deposits: { total: deposits.total, count: deposits.count },
      tvl: { total: tvl.tvl, breakdown: tvl.breakdown },
      yield: { total: yieldData.total_yield },
      points: { total: points.total_points },
      revenue: {
        revenue_share_pct: revenueData?.revenue_share_pct ?? 0,
        annual_partner_revenue: revenueData?.annual.partner_revenue ?? 0,
        daily_partner_revenue: revenueData?.daily.partner_revenue ?? 0,
      },
      as_of: new Date().toISOString(),
    };
  }

  @Get('users')
  @ApiOperation({ summary: 'Attributed users' })
  async getUsers(@PartnerId() partnerId: string | null): Promise<unknown[]> {
    const pid = this.requirePartnerId(partnerId);
    return this.attribution.getAttributedUsers(pid);
  }

  @Get('deposits')
  @ApiOperation({ summary: 'Attributed deposits' })
  async getDeposits(@PartnerId() partnerId: string | null): Promise<unknown> {
    const pid = this.requirePartnerId(partnerId);
    return { object: 'partner_deposits', partner_id: pid, ...(await this.attribution.getAttributedDeposits(pid)) };
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'Attributed withdrawals' })
  async getWithdrawals(@PartnerId() partnerId: string | null): Promise<unknown> {
    const pid = this.requirePartnerId(partnerId);
    return { object: 'partner_withdrawals', partner_id: pid, ...(await this.attribution.getAttributedWithdrawals(pid)) };
  }

  @Get('tvl')
  @ApiOperation({ summary: 'Net TVL for partner' })
  async getTvl(@PartnerId() partnerId: string | null): Promise<unknown> {
    const pid = this.requirePartnerId(partnerId);
    return { object: 'partner_tvl', partner_id: pid, ...(await this.attribution.getNetTVL(pid)) };
  }

  @Get('yield')
  @ApiOperation({ summary: 'Attributed yield' })
  async getYield(@PartnerId() partnerId: string | null): Promise<unknown> {
    const pid = this.requirePartnerId(partnerId);
    return { object: 'partner_yield', partner_id: pid, ...(await this.attribution.getAttributedYield(pid)) };
  }

  @Get('yield/history/:asset')
  @ApiParam({ name: 'asset', enum: ['USDC', 'USDT'] })
  @ApiOperation({ summary: 'Yield history for asset' })
  async getYieldHistory(@Param('asset') asset: string): Promise<unknown> {
    const vaults = await this.store.filter<any>('vaults', (v) => v.asset === asset.toUpperCase() && v.status === 'active');
    if (vaults.length === 0) throw new NotFoundException(`Unsupported asset "${asset}".`);
    const totalAlloc = vaults.reduce((s: number, v: any) => s + ((v.allocation_pct as number) || 0), 0);
    const blendApy = totalAlloc > 0
      ? vaults.reduce((s: number, v: any) => s + (v.apy as number) * ((v.allocation_pct as number) || 0), 0) / totalAlloc
      : vaults.reduce((s: number, v: any) => s + (v.apy as number), 0) / vaults.length;
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const history = Array.from({ length: 30 }, (_, i) => {
      const seed = `yieldhist:${asset.toUpperCase()}:${i}`;
      let h = 1779033703 ^ seed.length;
      for (let j = 0; j < seed.length; j++) {
        h = Math.imul(h ^ seed.charCodeAt(j), 3432918353);
        h = (h << 13) | (h >>> 19);
      }
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      const u32 = (h ^= h >>> 16) >>> 0;
      let a = u32;
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const rng = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      const drift = (rng - 0.5) * 0.01;
      return { t: now - (29 - i) * dayMs, apy: Math.round(Math.max(0, blendApy + drift) * 10000) / 10000 };
    });
    return { object: 'yield_history', asset: asset.toUpperCase(), blend_apy: Math.round(blendApy * 10000) / 10000, history };
  }

  @Get('points')
  @ApiOperation({ summary: 'Attributed points' })
  async getPoints(@PartnerId() partnerId: string | null): Promise<unknown> {
    const pid = this.requirePartnerId(partnerId);
    return { object: 'partner_points', partner_id: pid, ...(await this.attribution.getAttributedPoints(pid)) };
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue share calculation' })
  @ApiOkResponse({ type: RevenueShareOutputDto })
  async getRevenue(@PartnerId() partnerId: string | null): Promise<RevenueShareOutputDto> {
    const pid = this.requirePartnerId(partnerId);
    const result = await this.revenue.calculateRevenueShare(pid);
    if (!result) throw new NotFoundException('Partner not found.');
    return result as unknown as RevenueShareOutputDto;
  }

  @Get('user/:id/positions')
  @ApiParam({ name: 'id', example: 'usr_seed_nova' })
  @ApiOperation({ summary: 'User positions (partner-scoped)' })
  async getUserPositions(
    @PartnerId() partnerId: string | null,
    @Param('id') userId: string,
  ): Promise<unknown> {
    const pid = this.requirePartnerId(partnerId);
    if (!(await this.attribution.isUserAttributedToPartner(userId, pid))) {
      throw new ForbiddenException('This user is not attributed to your partner account.');
    }
    const positions = await this.store.filter<any>('positions', (p) => p.user_id === userId);
    return positions.map((p: any) => {
      const apy = (p.apy as number) ?? 0;
      const openedMs = Date.parse(p.opened_at as string);
      const endMs = p.status === 'closed' ? Date.parse(p.updated_at as string) : Date.now();
      const years = Math.max(0, (endMs - openedMs) / (365 * 24 * 60 * 60 * 1000));
      const currentValue = Math.round((p.principal as number) * (1 + apy * years) * 100) / 100;
      return { ...p, current_value: currentValue, accrued_yield: Math.round((currentValue - (p.principal as number)) * 100) / 100 };
    });
  }
}
