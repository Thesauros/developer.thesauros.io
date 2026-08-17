import { BadRequestException, Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PartnerId, RequiredScope } from '../common/decorators';
import { USAGE_RANGES, UsageRange, UsageService } from './usage.service';

@ApiTags('Usage')
@ApiBearerAuth()
@Controller('usage')
@RequiredScope('partner:read')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @ApiQuery({ name: 'range', required: false, enum: USAGE_RANGES })
  @ApiOperation({ summary: 'Request/latency time series + totals from real request logs' })
  async getUsage(@PartnerId() partnerId: string | null, @Query('range') range?: string) {
    if (!partnerId) {
      throw new ForbiddenException('Usage requires a partner-scoped API key.');
    }
    const effectiveRange = (range ?? '30d') as UsageRange;
    if (!USAGE_RANGES.includes(effectiveRange)) {
      throw new BadRequestException('range must be one of 24h, 7d, 30d.');
    }
    return this.usage.usageSeries(partnerId, effectiveRange);
  }
}
