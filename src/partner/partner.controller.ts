import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PartnerService } from './partner.service';
import { AuthService } from '../auth/auth.service';
import { RequiredScope } from '../common/decorators';
import {
  CreatePartnerInputDto,
  UpdatePartnerInputDto,
  CreateCampaignInputDto,
  PartnerOutputDto,
  CampaignOutputDto,
} from './dto';

@ApiTags('Partners (Admin)')
@ApiBearerAuth()
@Controller('partners')
@RequiredScope('partner:admin')
export class PartnerController {
  constructor(
    private readonly partnerService: PartnerService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create partner', description: 'Creates a partner and generates a scoped API key.' })
  @ApiOkResponse({ type: PartnerOutputDto })
  createPartner(@Body() dto: CreatePartnerInputDto): {
    partner: PartnerOutputDto;
    api_key: { secret: string; id: string; label: string };
  } {
    const partner = this.partnerService.createPartner(dto) as unknown as PartnerOutputDto;
    const key = this.authService.generateKey({
      label: `${partner.name} partner key`,
      environment: 'test',
      partner_id: partner.id,
    });
    return {
      partner,
      api_key: {
        id: key.id,
        label: key.label,
        secret: key._plaintext_secret,
      },
    };
  }

  @Get()
  @ApiOperation({ summary: 'List partners' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'disabled'] })
  @ApiOkResponse({ type: [PartnerOutputDto] })
  listPartners(@Query('status') status?: string): PartnerOutputDto[] {
    return this.partnerService.listPartners(status) as unknown as PartnerOutputDto[];
  }

  @Get(':id')
  @ApiParam({ name: 'id', example: 'ptn_seed_acme' })
  @ApiOperation({ summary: 'Get partner by ID' })
  @ApiOkResponse({ type: PartnerOutputDto })
  getPartner(@Param('id') id: string): PartnerOutputDto {
    const partner = this.partnerService.getPartner(id);
    if (!partner) throw new NotFoundException(`Partner "${id}" not found.`);
    return partner as unknown as PartnerOutputDto;
  }

  @Patch(':id')
  @ApiParam({ name: 'id', example: 'ptn_seed_acme' })
  @ApiOperation({ summary: 'Update partner' })
  @ApiOkResponse({ type: PartnerOutputDto })
  updatePartner(@Param('id') id: string, @Body() dto: UpdatePartnerInputDto): PartnerOutputDto {
    const partner = this.partnerService.updatePartner(id, dto as any);
    if (!partner) throw new NotFoundException(`Partner "${id}" not found.`);
    return partner as unknown as PartnerOutputDto;
  }

  @Post(':id/campaigns')
  @ApiParam({ name: 'id', example: 'ptn_seed_acme' })
  @ApiOperation({ summary: 'Create campaign for partner' })
  @ApiOkResponse({ type: CampaignOutputDto })
  createCampaign(@Param('id') id: string, @Body() dto: CreateCampaignInputDto): CampaignOutputDto {
    const partner = this.partnerService.getPartner(id);
    if (!partner) throw new NotFoundException(`Partner "${id}" not found.`);
    return this.partnerService.createCampaign(id, dto) as unknown as CampaignOutputDto;
  }

  @Get(':id/campaigns')
  @ApiParam({ name: 'id', example: 'ptn_seed_acme' })
  @ApiOperation({ summary: 'List campaigns for partner' })
  @ApiOkResponse({ type: [CampaignOutputDto] })
  listCampaigns(@Param('id') id: string): CampaignOutputDto[] {
    const partner = this.partnerService.getPartner(id);
    if (!partner) throw new NotFoundException(`Partner "${id}" not found.`);
    return this.partnerService.listCampaigns(id) as unknown as CampaignOutputDto[];
  }
}
