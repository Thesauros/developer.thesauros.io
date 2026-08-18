import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PartnerId, RequiredScope } from '../common/decorators';
import { paginate } from '../common/paged';
import { AnalyticsService } from './analytics.service';

/**
 * Rebalancer decision telemetry.
 *
 * Protocol-level reads (signals, regime) are open to any key; anything derived
 * from positions (uplift, decisions, advisor) is scoped to the calling
 * partner's own attributed positions.
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@RequiredScope('read', 'partner:read')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  private requirePartnerId(partnerId: string | null): string {
    if (!partnerId) {
      throw new ForbiddenException('This endpoint requires a partner-scoped API key.');
    }
    return partnerId;
  }

  @Get('signals')
  @ApiQuery({ name: 'asset', required: false })
  @ApiOperation({ summary: 'Risk-adjusted venue signals from observed APY history' })
  async signals(@Query('asset') asset?: string) {
    return this.analytics.signals(asset);
  }

  @Get('regime')
  @ApiQuery({ name: 'asset', required: false })
  @ApiOperation({ summary: 'Current rate regime and per-asset trend' })
  async regime(@Query('asset') asset?: string) {
    return this.analytics.regime(asset);
  }

  @Get('uplift')
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiOperation({ summary: 'Routed value vs the passive baseline, realized and projected' })
  async uplift(
    @PartnerId() partnerId: string | null,
    @Query('user_id') userId?: string,
    @Query('asset') asset?: string,
  ) {
    return this.analytics.uplift({
      partnerId: this.requirePartnerId(partnerId),
      userId,
      asset,
    });
  }

  @Get('decisions')
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'position_id', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOperation({ summary: 'Executed routing and rebalance decisions with rationale' })
  async decisions(
    @PartnerId() partnerId: string | null,
    @Query('user_id') userId?: string,
    @Query('position_id') positionId?: string,
    @Query('asset') asset?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const rows = await this.analytics.decisions({
      partnerId: this.requirePartnerId(partnerId),
      userId,
      positionId,
      asset,
    });
    return paginate(rows, { limit, cursor });
  }

  @Get('advisor')
  @ApiQuery({ name: 'asset', required: false })
  @ApiOperation({ summary: 'Current recommendations with rationale' })
  async advisor(@PartnerId() partnerId: string | null, @Query('asset') asset?: string) {
    return this.analytics.advisor({
      partnerId: this.requirePartnerId(partnerId),
      asset,
    });
  }
}
