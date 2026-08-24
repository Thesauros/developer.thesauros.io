import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RequiredScope } from '../common/decorators';
import { YieldService, YieldHistory } from './yield.service';

@ApiTags('Yield (Protocol)')
@ApiBearerAuth()
@Controller('yield')
@RequiredScope('read', 'partner:read')
export class YieldController {
  constructor(private readonly yieldService: YieldService) {}

  @Get('history/:asset')
  @ApiParam({ name: 'asset', enum: ['USDC', 'USDT0'] })
  @ApiOperation({
    summary: 'Blended APY history for an asset',
    description:
      'Protocol-wide blended APY across active Thesauros vaults for the asset. ' +
      'The series is identical for every caller and contains no partner-attributed data, ' +
      'so a partner binding is not required — any key with `read` or `partner:read` works.',
  })
  async getHistory(@Param('asset') asset: string): Promise<YieldHistory> {
    return this.yieldService.getAssetHistory(asset);
  }
}
