import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PartnerId, RequiredScope } from '../common/decorators';
import { AttributionService } from '../partner/attribution.service';
import { StoreService } from '../store/store.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CreateUserInputDto } from './dto';

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserRecord {
  id: string;
  external_id: string | null;
  [key: string]: unknown;
}

interface PositionRecord {
  id: string;
  user_id: string;
  asset?: string;
  [key: string]: unknown;
}

interface PositionEventRecord {
  id: string;
  position_id: string;
  type: string;
  at: string;
  amount: number;
  apy: number | null;
  vault_id: string | null;
  note: string | null;
  [key: string]: unknown;
}

/**
 * Partner-scoped end-user management: POST create (sandbox field shape) and
 * the per-user event ledger the portal's Ledger panel reads.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@RequiredScope('partner:read')
export class UsersController {
  constructor(
    private readonly store: StoreService,
    private readonly attribution: AttributionService,
    private readonly webhooks: WebhooksService,
  ) {}

  private requirePartnerId(partnerId: string | null): string {
    if (!partnerId) {
      throw new ForbiddenException('This endpoint requires a partner-scoped API key.');
    }
    return partnerId;
  }

  @Post()
  @ApiOperation({ summary: 'Create an attributed end-user' })
  async create(@PartnerId() partnerId: string | null, @Body() dto: CreateUserInputDto) {
    const pid = this.requirePartnerId(partnerId);
    const externalId = String(dto.external_id ?? '').trim();
    if (!externalId) throw new BadRequestException('external_id is required (your customer id).');
    const existing = await this.store.filter<UserRecord>('users', (u) => u.external_id === externalId);
    if (existing.length) {
      throw new BadRequestException(`A user with external_id "${externalId}" already exists.`);
    }
    if (dto.email != null && !EMAIL_RE.test(dto.email)) throw new BadRequestException('email is invalid.');
    const wallets = dto.wallets ?? [];
    for (const wallet of wallets) {
      if (!WALLET_RE.test(wallet)) throw new BadRequestException(`Invalid wallet address "${wallet}".`);
    }

    const now = new Date().toISOString();
    const user = await this.store.create<UserRecord>('users', {
      id: this.store.randomId('usr'),
      object: 'user',
      external_id: externalId,
      label: dto.label != null ? String(dto.label) : '',
      email: dto.email ?? null,
      metadata: dto.metadata && typeof dto.metadata === 'object' ? dto.metadata : {},
      wallets,
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    // The user is attributed to the creating partner — that is what makes it
    // appear in /partner/users and the partner's TVL/yield aggregates.
    await this.attribution.attributeUser({ user_id: user.id as string, partner_id: pid, source: 'api' });

    void this.webhooks.emit(pid, 'system.status', {
      message: `User ${user.id} created`,
      user_id: user.id,
    });

    return user;
  }

  @Get(':id/ledger')
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOperation({ summary: 'Per-user event ledger (deposits, withdrawals, rebalances, yield accruals)' })
  async ledger(
    @PartnerId() partnerId: string | null,
    @Param('id') userId: string,
    @Query('limit') limit?: string,
  ) {
    const pid = this.requirePartnerId(partnerId);
    const user = await this.store.get<UserRecord>('users', userId);
    if (!user) throw new NotFoundException('No user with that id.');
    if (!(await this.attribution.isUserAttributedToPartner(userId, pid))) {
      throw new ForbiddenException('This user is not attributed to your partner account.');
    }

    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10) || 50));
    const positions = await this.store.filter<PositionRecord>('positions', (p) => p.user_id === userId);
    const positionIds = new Set(positions.map((p) => p.id));
    const assetByPosition = new Map(positions.map((p) => [p.id, p.asset ?? null]));

    const events = await this.store.filter<PositionEventRecord>('positionEvents', (e) =>
      positionIds.has(e.position_id),
    );

    // timestamptz columns hydrate as Date objects, not strings — compare epochs.
    return events
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, parsedLimit)
      .map((event) => ({
        id: event.id,
        object: 'ledger_entry',
        user_id: userId,
        position_id: event.position_id,
        asset: assetByPosition.get(event.position_id) ?? null,
        type: event.type,
        amount: event.amount,
        apy: event.apy,
        vault_id: event.vault_id,
        note: event.note,
        at: event.at,
      }));
  }
}
