import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CreateCampaignInputDto } from './create-campaign.input.dto';

export class UpdateCampaignInputDto extends PartialType(CreateCampaignInputDto) {
  @ApiPropertyOptional({
    enum: ['active', 'disabled'],
    description: 'Disable a campaign without deleting (soft-disable).',
  })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;
}
