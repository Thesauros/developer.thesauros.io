import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CreatePartnerInputDto } from './create-partner.input.dto';

export class UpdatePartnerInputDto extends PartialType(CreatePartnerInputDto) {
  @ApiPropertyOptional({
    enum: ['active', 'disabled'],
    description: 'Disable a partner without deleting (soft-disable). Disabled partners stay in DB for history.',
  })
  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: string;
}
