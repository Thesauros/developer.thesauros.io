import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiKeyOutputDto {
  @ApiProperty({ example: 'key_a1b2c3d4e5f60718' })
  id: string;

  @ApiProperty({ example: 'api_key' })
  object: string;

  @ApiProperty({ example: 'My integration key' })
  label: string;

  @ApiProperty({ example: 'tsk_test_...a1b2', description: 'Masked secret (full shown only on creation)' })
  secret: string;

  @ApiProperty({ example: 'tsk_test_My' })
  prefix: string;

  @ApiProperty({ example: 'test', enum: ['test', 'live'] })
  environment: string;

  @ApiProperty({ example: ['read', 'write'] })
  scopes: string[];

  @ApiPropertyOptional({ example: 'ptn_seed_acme', nullable: true })
  partner_id: string | null;

  @ApiProperty({ example: '2026-07-28T12:00:00.000Z' })
  created_at: string;

  @ApiPropertyOptional({ nullable: true })
  last_used_at: string | null;

  @ApiProperty({ example: false })
  revoked: boolean;
}
