import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateWebhookInputDto {
  @ApiProperty({ example: 'https://partner.example.com/webhooks/thesauros' })
  @IsString()
  @MinLength(1)
  url: string;

  @ApiPropertyOptional({ example: ['position.opened', 'position.closed'], description: 'Event types, or ["*"] for all. Default: ["*"].' })
  @IsOptional()
  @IsArray()
  events?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateWebhookInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  events?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
