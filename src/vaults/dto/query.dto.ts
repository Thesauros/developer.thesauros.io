import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
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

export class ApyHistoryQueryDto {
  @ApiPropertyOptional({ example: 'vault_aave_base_usdc', description: 'Vault id. Required.' })
  @IsString()
  @Matches(/^[a-z]+_[A-Za-z0-9_]+$/, { message: 'vault must look like vault_<id>' })
  vault: string;

  @ApiPropertyOptional({ example: '7', description: 'Window in days, 1-90 (default 7).' })
  @IsOptional()
  @Transform(blankToUndefined)
  @Matches(/^\d+$/, { message: 'days must be a positive integer' })
  days?: string;
}
