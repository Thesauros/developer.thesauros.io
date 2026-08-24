import { IntersectionType } from '@nestjs/swagger';
import { AssetQueryDto, PageQueryDto, ScopeFilterQueryDto } from '../common/dto/query.dto';

export class SignalsQueryDto extends AssetQueryDto {}
export class RegimeQueryDto extends AssetQueryDto {}
export class AdvisorQueryDto extends AssetQueryDto {}

export class UpliftQueryDto extends ScopeFilterQueryDto {}

export class DecisionsQueryDto extends IntersectionType(ScopeFilterQueryDto, PageQueryDto) {}
