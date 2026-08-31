import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { AssetQueryDto } from '../../common/dto/query.dto';

/** Chains vaults are deployed on. */
export const VALID_NETWORKS = ['arbitrum', 'base', 'plasma', 'monad', 'mainnet'];

const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class VaultsQueryDto extends AssetQueryDto {
  @ApiPropertyOptional({
    enum: VALID_NETWORKS,
    description: 'Filter to one chain. Omit for every chain — no server state is switched.',
  })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsIn(VALID_NETWORKS)
  network?: string;
}

/** Longest history window the endpoint serves, as documented. */
export const MAX_HISTORY_DAYS = 90;
export const DEFAULT_HISTORY_DAYS = 7;

const DAYS_MESSAGE = `days must be a whole number between 1 and ${MAX_HISTORY_DAYS}`;

/**
 * Digits in, number out. Anything else (`abc`, `7.5`, `-1`, `0x10`) becomes NaN
 * so the range validators below reject it instead of Number() quietly
 * accepting a shape the docs never promised.
 */
const toDays = ({ value }: { value: unknown }) => {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) return undefined;
  return /^\d+$/.test(String(value).trim()) ? Number(value) : Number.NaN;
};

export class ApyHistoryQueryDto {
  @ApiPropertyOptional({ example: 'vault_aave_base_usdc', description: 'Vault id. Required.' })
  @IsString()
  @Matches(/^[a-z]+_[A-Za-z0-9_]+$/, { message: 'vault must look like vault_<id>' })
  vault: string;

  @ApiPropertyOptional({
    example: 7,
    minimum: 1,
    maximum: MAX_HISTORY_DAYS,
    description: `Window in days, 1-${MAX_HISTORY_DAYS} (default ${DEFAULT_HISTORY_DAYS}).`,
  })
  @IsOptional()
  @Transform(toDays)
  @IsInt({ message: DAYS_MESSAGE })
  @Min(1, { message: DAYS_MESSAGE })
  @Max(MAX_HISTORY_DAYS, { message: DAYS_MESSAGE })
  days?: number;
}
