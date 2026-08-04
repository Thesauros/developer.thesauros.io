import { PartialType } from '@nestjs/swagger';
import { CreatePartnerInputDto } from './create-partner.input.dto';

export class UpdatePartnerInputDto extends PartialType(CreatePartnerInputDto) {}
