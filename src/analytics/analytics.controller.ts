import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { PartnerId, RequiredScope } from '../common/decorators';
import { paginate } from '../common/paged';
import { AnalyticsService } from './analytics.service';
import { AdvisorQueryDto, DecisionsQueryDto, RegimeQueryDto, SignalsQueryDto, UpliftQueryDto } from './dto';

/**
 * Rebalancer decision telemetry.
 *
 * Scopes: `signals` and `regime` are protocol-level — any valid key (`read`
 * or `partner:read`) can call them. `uplift`, `decisions` and `advisor` read
 * the caller's own attributed positions and therefore require a
 * partner-scoped key; an admin `read` key gets 403 because there is no
 * partner to scope to.
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
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
  @ApiOperation({
    summary: 'Risk-adjusted venue signals from observed APY history',
    description:
      'Scope: `read` or `partner:read` (protocol-level, same answer for every caller). ' +
      'Volatility/trend fields are null with `insufficient_history: true` until enough hourly snapshots exist.',
  })
  async signals(@Query() query: SignalsQueryDto) {
    return this.analytics.signals(query.asset);
  }

  @Get('regime')
  @ApiOperation({
    summary: 'Current rate regime and per-asset trend',
    description:
      'Scope: `read` or `partner:read` (protocol-level). ' +
      '`regime` is "unknown" until enough observations exist — never guessed.',
  })
  async regime(@Query() query: RegimeQueryDto) {
    return this.analytics.regime(query.asset);
  }

  @Get('uplift')
  @ApiForbiddenResponse({ description: 'Key is not partner-scoped.' })
  @ApiOperation({
    summary: 'Routed value vs the passive baseline, realized and projected',
    description:
      'Scope: `partner:read` only — computed over the calling partner’s attributed positions. ' +
      '`user_id` must be a user attributed to the caller.',
  })
  async uplift(@PartnerId() partnerId: string | null, @Query() query: UpliftQueryDto) {
    return this.analytics.uplift({
      partnerId: this.requirePartnerId(partnerId),
      userId: query.user_id,
      asset: query.asset,
    });
  }

  @Get('decisions')
  @ApiForbiddenResponse({ description: 'Key is not partner-scoped.' })
  @ApiOperation({
    summary: 'Executed routing and rebalance decisions with rationale',
    description:
      'Scope: `partner:read` only — the caller sees decisions on its own positions. ' +
      'Paginated: pass `limit` and the previous page’s `meta.next_cursor` as `cursor`.',
  })
  async decisions(@PartnerId() partnerId: string | null, @Query() query: DecisionsQueryDto) {
    const rows = await this.analytics.decisions({
      partnerId: this.requirePartnerId(partnerId),
      userId: query.user_id,
      positionId: query.position_id,
      asset: query.asset,
    });
    return paginate(rows, { limit: query.limit, cursor: query.cursor });
  }

  @Get('advisor')
  @ApiForbiddenResponse({ description: 'Key is not partner-scoped.' })
  @ApiOperation({
    summary: 'Current recommendations with rationale',
    description:
      'Scope: `partner:read` only — the portfolio section reflects the calling partner’s positions.',
  })
  async advisor(@PartnerId() partnerId: string | null, @Query() query: AdvisorQueryDto) {
    return this.analytics.advisor({
      partnerId: this.requirePartnerId(partnerId),
      asset: query.asset,
    });
  }
}
