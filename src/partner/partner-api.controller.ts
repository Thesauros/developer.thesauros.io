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
import { YieldService } from '../yield/yield.service';
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
    private readonly yieldService: YieldService,
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
  @ApiOperation({
    summary: 'Yield history for asset (deprecated)',
    deprecated: true,
    description:
      'Deprecated — use `GET /api/v1/yield/history/:asset` instead. The series is protocol-wide ' +
      'blended APY, identical for every partner, so it does not belong under the partner-scoped ' +
      'namespace. This alias returns an identical payload but still requires a partner-scoped key, ' +
      'because every route under /partner/* does.',
  })
  async getYieldHistory(
    @PartnerId() partnerId: string | null,
    @Param('asset') asset: string,
  ): Promise<unknown> {
    this.requirePartnerId(partnerId);
    return this.yieldService.getAssetHistory(asset);
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
