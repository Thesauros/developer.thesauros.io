import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { PartnerId, RequiredScope } from '../common/decorators';
import { paginate } from '../common/paged';
import { BalancesQueryDto, LedgerQueryDto, ReportQueryDto, SnapshotsQueryDto } from './dto';
import { ReconciliationService } from './reconciliation.service';

/**
 * Accounting vs the chain.
 *
 * Scopes: `balances`, `ledger` and `snapshots` require a partner-scoped key
 * and cover only the caller's attributed positions. `report` is protocol-wide
 * (a partner holds a slice of each vault, so a per-partner chain comparison
 * would always look broken) and requires an admin `read` key — partner keys
 * get 403 there.
 */
@ApiTags('Reconciliation')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
@Controller('reconciliation')
@RequiredScope('read', 'partner:read')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  private requirePartnerId(partnerId: string | null): string {
    if (!partnerId) {
      throw new ForbiddenException('This endpoint requires a partner-scoped API key.');
    }
    return partnerId;
  }

  @Get('balances')
  @ApiForbiddenResponse({ description: 'Key is not partner-scoped.' })
  @ApiOperation({
    summary: 'Recorded balances by user and asset',
    description: 'Scope: `partner:read` only. Active positions of the calling partner, grouped by user and asset.',
  })
  async balances(@PartnerId() partnerId: string | null, @Query() query: BalancesQueryDto) {
    return this.reconciliation.balances({
      partnerId: this.requirePartnerId(partnerId),
      userId: query.user_id,
      asset: query.asset,
    });
  }

  @Get('ledger')
  @ApiForbiddenResponse({ description: 'Key is not partner-scoped.' })
  @ApiOperation({
    summary: 'Movement rows with running balance',
    description:
      'Scope: `partner:read` only. Deposits, withdrawals, closes and an accrual row per position ' +
      '(`settled: false` while the position is open). Paginated via `limit`/`cursor`.',
  })
  async ledger(@PartnerId() partnerId: string | null, @Query() query: LedgerQueryDto) {
    const rows = await this.reconciliation.ledger({
      partnerId: this.requirePartnerId(partnerId),
      userId: query.user_id,
      positionId: query.position_id,
      asset: query.asset,
      type: query.type,
    });
    return paginate(rows, { limit: query.limit, cursor: query.cursor });
  }

  @Get('snapshots')
  @ApiForbiddenResponse({ description: 'Key is not partner-scoped.' })
  @ApiOperation({
    summary: 'Daily balance snapshots for period accounting',
    description: 'Scope: `partner:read` only. One row per day in [`from`, `to`] (default: trailing 30 days).',
  })
  async snapshots(@PartnerId() partnerId: string | null, @Query() query: SnapshotsQueryDto) {
    return this.reconciliation.snapshots({
      partnerId: this.requirePartnerId(partnerId),
      asset: query.asset,
      from: query.from,
      to: query.to,
    });
  }

  @Get('report')
  @RequiredScope('read')
  @ApiForbiddenResponse({ description: 'Partner keys cannot read the protocol-wide report.' })
  @ApiOperation({
    summary: 'Recorded accounting vs observed on-chain balances',
    description:
      'Scope: admin `read` only (protocol-wide by design). Needs `MONITOR_API_URL` configured — ' +
      'otherwise returns the same shape with `status: "unavailable"` and the chain side nulled.',
  })
  async report(@Query() query: ReportQueryDto) {
    return this.reconciliation.report({ asset: query.asset });
  }
}
