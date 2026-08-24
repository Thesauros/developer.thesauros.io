import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RequiredScope } from '../common/decorators';
import { ApiEnvelope, ApiEnvelopeList } from '../common/swagger/envelope';
import { ApyHistoryDto, ApyHistoryQueryDto, VaultDto, VaultsQueryDto } from './dto/index';
import { VaultsService } from './vaults.service';

const MAX_HISTORY_DAYS = 90;

/**
 * Protocol-level vault reference data. Same answer for every caller, so any
 * valid key works — there is nothing partner-specific to scope to.
 *
 * The chain is chosen per request via `?network=`; nothing here mutates
 * server state, so concurrent callers can read different chains at once.
 */
@ApiTags('Vaults')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid API key.' })
@Controller()
@RequiredScope('read', 'partner:read')
export class VaultsController {
  constructor(private readonly vaults: VaultsService) {}

  @Get('vaults')
  @ApiEnvelopeList(VaultDto, { description: 'Highest current APY first.' })
  @ApiOperation({
    summary: 'Vaults with observed trailing APY averages and risk tier',
    description:
      'Scope: `read` or `partner:read` (protocol-level). ' +
      '`apy_7d_avg`/`apy_30d_avg` come from recorded hourly observations and are null until enough exist.',
  })
  async list(@Query() query: VaultsQueryDto) {
    return this.vaults.list({ asset: query.asset, network: query.network });
  }

  @Get('apy/history')
  @ApiEnvelope(ApyHistoryDto)
  @ApiOperation({
    summary: 'Observed APY series for one vault',
    description:
      'Scope: `read` or `partner:read` (protocol-level). ' +
      '`vault` is required; `days` is 1-90 (default 7). Points are the recorded hourly observations, oldest first.',
  })
  async apyHistory(@Query() query: ApyHistoryQueryDto) {
    const days = Math.min(MAX_HISTORY_DAYS, Math.max(1, parseInt(query.days ?? '7', 10) || 7));
    return this.vaults.apyHistory(query.vault, days);
  }
}
