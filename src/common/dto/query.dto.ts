import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

/** Assets with deployed vaults. Plasma's USDT flavour is USDT0 — plain USDT does not exist. */
export const VALID_ASSETS = ['USDC', 'USDT0'];

const ID_RE = /^[a-z]+_[A-Za-z0-9_]+$/;

/** ?asset= — validated against deployed assets, case-insensitive. */
export class AssetQueryDto {
  @ApiPropertyOptional({ enum: VALID_ASSETS, description: 'Filter by asset symbol.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value))
  @IsIn(VALID_ASSETS)
  asset?: string;
}

/** ?limit=&cursor= — the contract's cursor pagination inputs. */
export class PageQueryDto {
  @ApiPropertyOptional({ description: 'Page size, 1–200 (default 50).', example: 50 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @Matches(/^\d+$/, { message: 'limit must be a positive integer' })
  limit?: string;

  @ApiPropertyOptional({
    description: 'Opaque cursor from the previous page’s meta.next_cursor. Omit for the first page.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  cursor?: string;
}

/** Shared user/position filters. IDs look like usr_…, pos_…. */
export class ScopeFilterQueryDto extends AssetQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to one end-user (usr_…).', example: 'usr_seed_nova' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @Matches(ID_RE, { message: 'user_id must look like usr_<id>' })
  user_id?: string;

  @ApiPropertyOptional({ description: 'Restrict to one position (pos_…).', example: 'pos_seed_alpha' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @Matches(ID_RE, { message: 'position_id must look like pos_<id>' })
  position_id?: string;
}
