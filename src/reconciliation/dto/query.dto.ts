import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import { AssetQueryDto, PageQueryDto, ScopeFilterQueryDto } from '../../common/dto/query.dto';

export class BalancesQueryDto extends ScopeFilterQueryDto {}

export class LedgerQueryDto extends IntersectionType(ScopeFilterQueryDto, PageQueryDto) {
  @ApiPropertyOptional({
    enum: ['deposit', 'withdraw', 'close', 'accrual'],
    description: 'Filter to one movement type.',
  })
  @IsOptional()
  type?: string;
}

export class SnapshotsQueryDto extends AssetQueryDto {
  @ApiPropertyOptional({ description: 'Window start, ISO 8601. Default: 29 days before `to`.', example: '2026-07-01' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Window end, ISO 8601. Default: now.', example: '2026-08-01' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class ReportQueryDto extends AssetQueryDto {}
