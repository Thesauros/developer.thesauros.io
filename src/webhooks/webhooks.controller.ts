import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PartnerId, RequiredScope } from '../common/decorators';
import { SUPPORTED_EVENTS, WebhooksService } from './webhooks.service';
import { CreateWebhookInputDto, UpdateWebhookInputDto } from './dto';

@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller('webhooks')
@RequiredScope('partner:read')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  private requirePartnerId(partnerId: string | null): string {
    if (!partnerId) {
      throw new ForbiddenException('Webhooks require a partner-scoped API key.');
    }
    return partnerId;
  }

  @Post()
  @ApiOperation({ summary: 'Register a webhook endpoint', description: 'The signing secret is returned in full exactly once, at creation.' })
  async create(@PartnerId() partnerId: string | null, @Body() dto: CreateWebhookInputDto) {
    const pid = this.requirePartnerId(partnerId);
    const url = this.webhooks.assertSafeUrl(dto.url);
    const events = this.webhooks.validateEvents(dto.events);
    const { webhook, plainSecret } = await this.webhooks.createWebhook(pid, url, events, dto.active !== false);
    // Full secret exactly once, at creation — list responses mask it.
    return { ...webhook, secret: plainSecret };
  }

  @Get()
  @ApiOperation({ summary: 'List webhook endpoints (secrets masked)' })
  async list(@PartnerId() partnerId: string | null) {
    const pid = this.requirePartnerId(partnerId);
    const rows = await this.webhooks.listWebhooks(pid);
    return rows.map((w) => this.webhooks.publicWebhook(w));
  }

  @Get('events')
  @ApiOperation({ summary: 'Supported webhook event types' })
  listEvents() {
    return { object: 'webhook_events', events: SUPPORTED_EVENTS };
  }

  @Get('deliveries')
  @ApiQuery({ name: 'webhook_id', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'Recent delivery attempts, newest first' })
  async deliveries(
    @PartnerId() partnerId: string | null,
    @Query('webhook_id') webhookId?: string,
    @Query('limit') limit?: string,
  ) {
    const pid = this.requirePartnerId(partnerId);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    return this.webhooks.listDeliveries(pid, webhookId, parsedLimit);
  }

  @Patch(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Update a webhook endpoint' })
  async update(
    @PartnerId() partnerId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookInputDto,
  ) {
    const pid = this.requirePartnerId(partnerId);
    const webhook = await this.webhooks.getWebhook(pid, id);
    if (!webhook) throw new NotFoundException('No webhook with that id.');

    const patch: Record<string, unknown> = {};
    if (dto.url !== undefined) patch.url = this.webhooks.assertSafeUrl(dto.url);
    if (dto.events !== undefined) patch.events = this.webhooks.validateEvents(dto.events);
    if (dto.active !== undefined) patch.active = dto.active;

    const updated = await this.webhooks.updateWebhook(webhook, patch);
    return this.webhooks.publicWebhook(updated!);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  async remove(@PartnerId() partnerId: string | null, @Param('id') id: string) {
    const pid = this.requirePartnerId(partnerId);
    const webhook = await this.webhooks.getWebhook(pid, id);
    if (!webhook) throw new NotFoundException('No webhook with that id.');
    await this.webhooks.deleteWebhook(webhook);
    return { id, deleted: true };
  }

  @Post(':id/test')
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Send a signed test event to the endpoint and record the delivery' })
  async test(@PartnerId() partnerId: string | null, @Param('id') id: string) {
    const pid = this.requirePartnerId(partnerId);
    const webhook = await this.webhooks.getWebhook(pid, id);
    if (!webhook) throw new NotFoundException('No webhook with that id.');
    return this.webhooks.dispatch(webhook, 'system.status', {
      message: 'Test delivery from the Thesauros Partner API.',
      requested_at: new Date().toISOString(),
    });
  }
}
