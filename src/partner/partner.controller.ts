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
  UpdateCampaignInputDto,
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
  async createPartner(@Body() dto: CreatePartnerInputDto): Promise<{
    partner: PartnerOutputDto;
    api_key: { secret: string; id: string; label: string };
  }> {
    const partner = await this.partnerService.createPartner(dto) as unknown as PartnerOutputDto;
    const key = await this.authService.generateKey({
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
  async listPartners(@Query('status') status?: string): Promise<PartnerOutputDto[]> {
    return await this.partnerService.listPartners(status) as unknown as PartnerOutputDto[];
  }

  @Get(':id')
  @ApiParam({ name: 'id', example: 'ptn_seed_acme' })
  @ApiOperation({ summary: 'Get partner by ID' })
  @ApiOkResponse({ type: PartnerOutputDto })
  async getPartner(@Param('id') id: string): Promise<PartnerOutputDto> {
    const partner = await this.partnerService.getPartner(id);
    if (!partner) throw new NotFoundException(`Partner "${id}" not found.`);
    return partner as unknown as PartnerOutputDto;
  }

  @Patch(':id')
  @ApiParam({ name: 'id', example: 'ptn_seed_acme' })
  @ApiOperation({
    summary: 'Update partner',
    description: 'Partial update. Pass status:"disabled" to soft-disable without deleting history/attributions.',
  })
  @ApiOkResponse({ type: PartnerOutputDto })
  async updatePartner(@Param('id') id: string, @Body() dto: UpdatePartnerInputDto): Promise<PartnerOutputDto> {
    const partner = await this.partnerService.updatePartner(id, dto as any);
    if (!partner) throw new NotFoundException(`Partner "${id}" not found.`);
    return partner as unknown as PartnerOutputDto;
  }

  @Post(':id/campaigns')
  @ApiParam({ name: 'id', example: 'ptn_seed_acme' })
  @ApiOperation({ summary: 'Create campaign for partner' })
  @ApiOkResponse({ type: CampaignOutputDto })
  async createCampaign(@Param('id') id: string, @Body() dto: CreateCampaignInputDto): Promise<CampaignOutputDto> {
    const partner = await this.partnerService.getPartner(id);
    if (!partner) throw new NotFoundException(`Partner "${id}" not found.`);
    return await this.partnerService.createCampaign(id, dto) as unknown as CampaignOutputDto;
  }

  @Get(':id/campaigns')
  @ApiParam({ name: 'id', example: 'ptn_seed_acme' })
  @ApiOperation({ summary: 'List campaigns for partner' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'disabled'] })
  @ApiOkResponse({ type: [CampaignOutputDto] })
  async listCampaigns(
    @Param('id') id: string,
    @Query('status') status?: string,
  ): Promise<CampaignOutputDto[]> {
    const partner = await this.partnerService.getPartner(id);
    if (!partner) throw new NotFoundException(`Partner "${id}" not found.`);
    return await this.partnerService.listCampaigns(id, status) as unknown as CampaignOutputDto[];
  }

  @Patch(':id/campaigns/:campaignId')
  @ApiParam({ name: 'id', example: 'ptn_seed_acme' })
  @ApiParam({ name: 'campaignId', example: 'cmp_seed_acme_launch' })
  @ApiOperation({
    summary: 'Update campaign',
    description: 'Partial update. Pass status:"disabled" to soft-disable a campaign without deleting it.',
  })
  @ApiOkResponse({ type: CampaignOutputDto })
  async updateCampaign(
    @Param('id') id: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: UpdateCampaignInputDto,
  ): Promise<CampaignOutputDto> {
    const partner = await this.partnerService.getPartner(id);
    if (!partner) throw new NotFoundException(`Partner "${id}" not found.`);
    const campaign = await this.partnerService.updateCampaign(id, campaignId, dto as any);
    if (!campaign) throw new NotFoundException(`Campaign "${campaignId}" not found for partner "${id}".`);
    return campaign as unknown as CampaignOutputDto;
  }
}
