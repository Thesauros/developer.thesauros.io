import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PartnerId, RequiredScope } from '../common/decorators';
import { paginate } from '../common/paged';
import { ReconciliationService } from './reconciliation.service';

/**
 * Accounting vs the chain. Balances, ledger and snapshots are scoped to the
 * calling partner; the report is protocol-wide (see the service comment) and
 * needs an admin `read` key.
 */
@ApiTags('Reconciliation')
@ApiBearerAuth()
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
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiOperation({ summary: 'Recorded balances by user and asset' })
  async balances(
    @PartnerId() partnerId: string | null,
    @Query('user_id') userId?: string,
    @Query('asset') asset?: string,
  ) {
    return this.reconciliation.balances({
      partnerId: this.requirePartnerId(partnerId),
      userId,
      asset,
    });
  }

  @Get('ledger')
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'position_id', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiOperation({ summary: 'Movement rows with running balance' })
  async ledger(
    @PartnerId() partnerId: string | null,
    @Query('user_id') userId?: string,
    @Query('position_id') positionId?: string,
    @Query('asset') asset?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const rows = await this.reconciliation.ledger({
      partnerId: this.requirePartnerId(partnerId),
      userId,
      positionId,
      asset,
      type,
    });
    return paginate(rows, { limit, cursor });
  }

  @Get('snapshots')
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'asset', required: false })
  @ApiOperation({ summary: 'Daily balance snapshots for period accounting' })
  async snapshots(
    @PartnerId() partnerId: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('asset') asset?: string,
  ) {
    return this.reconciliation.snapshots({
      partnerId: this.requirePartnerId(partnerId),
      asset,
      from,
      to,
    });
  }

  @Get('report')
  @RequiredScope('read')
  @ApiQuery({ name: 'asset', required: false })
  @ApiOperation({ summary: 'Recorded accounting vs observed on-chain balances' })
  async report(@Query('asset') asset?: string) {
    return this.reconciliation.report({ asset });
  }
}
