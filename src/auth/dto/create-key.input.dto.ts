import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsArray, MinLength, ArrayUnique } from 'class-validator';

const ALLOWED_SCOPES = ['read', 'write', 'partner:read', 'partner:admin'] as const;

export class CreateKeyInputDto {
  @ApiProperty({ example: 'My integration key' })
  @IsString()
  @MinLength(1)
  label: string;

  @ApiPropertyOptional({ enum: ['test'], default: 'test', description: 'Only test keys can be created via API.' })
  @IsOptional()
  @IsIn(['test'])
  environment?: string;

  @ApiPropertyOptional({ example: ['read'], enum: ALLOWED_SCOPES, description: 'Permitted scopes. Wildcards and keys:admin are not assignable.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALLOWED_SCOPES, { each: true })
  scopes?: string[];

  @ApiPropertyOptional({ example: 'ptn_seed_acme', description: 'Bind key to a partner for scoped access' })
  @IsOptional()
  @IsString()
  partner_id?: string;
}
