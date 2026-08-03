import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { StoreService } from '../store/store.service';

interface Partner {
  id: string;
  object: string;
  name: string;
  slug: string;
  contact_email: string | null;
  webhook_url: string | null;
  revenue_share_pct: number;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface Campaign {
  id: string;
  object: string;
  partner_id: string;
  name: string;
  slug: string;
  utm_source: string | null;
  utm_medium: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

@Injectable()
export class PartnerService {
  constructor(private readonly store: StoreService) {}

  /* ---------------------------------------------------------------- *
   * Partners
   * ---------------------------------------------------------------- */

  createPartner(data: {
    name: string;
    slug?: string;
    contact_email?: string;
    webhook_url?: string;
    revenue_share_pct?: number;
    metadata?: Record<string, unknown>;
  }): Partner {
    const slug = this.normalizeSlug(data.slug || data.name);
    this.validateSlug(slug);
    const existing = this.store.filter<Partner>('partners', (p) => p.slug === slug)[0];
    if (existing) {
      throw new ConflictException(`Slug "${slug}" is already taken by partner "${existing.name}".`);
    }
    const now = new Date().toISOString();
    return this.store.create<Partner>('partners', {
      id: this.store.randomId('ptn'),
      object: 'partner',
      name: data.name,
      slug,
      contact_email: data.contact_email ?? null,
      webhook_url: data.webhook_url ?? null,
      revenue_share_pct: typeof data.revenue_share_pct === 'number'
        ? Math.min(1, Math.max(0, data.revenue_share_pct))
        : 0.15,
      status: 'active',
      metadata: data.metadata ?? {},
      created_at: now,
      updated_at: now,
    });
  }

  getPartner(id: string): Partner | null {
    return this.store.get<Partner>('partners', id);
  }

  getPartnerBySlug(slug: string): Partner | null {
    return this.store.filter<Partner>('partners', (p) => p.slug === slug)[0] ?? null;
  }

  listPartners(status?: string): Partner[] {
    if (status) return this.store.filter<Partner>('partners', (p) => p.status === status);
    return this.store.all<Partner>('partners');
  }

  updatePartner(id: string, patch: Partial<Partner>): Partner | null {
    if (patch.slug) {
      const slug = this.normalizeSlug(patch.slug);
      this.validateSlug(slug);
      const conflict = this.store.filter<Partner>(
        'partners',
        (p) => p.slug === slug && p.id !== id,
      )[0];
      if (conflict) throw new ConflictException(`Slug "${slug}" is already taken.`);
      patch.slug = slug;
    }
    if (patch.revenue_share_pct !== undefined) {
      patch.revenue_share_pct = Math.min(1, Math.max(0, patch.revenue_share_pct));
    }
    patch.updated_at = new Date().toISOString();
    return this.store.update<Partner>('partners', id, patch);
  }

  /* ---------------------------------------------------------------- *
   * Campaigns
   * ---------------------------------------------------------------- */

  createCampaign(partnerId: string, data: {
    name: string;
    slug?: string;
    utm_source?: string;
    utm_medium?: string;
  }): Campaign {
    const slug = this.normalizeSlug(data.slug || data.name);
    this.validateSlug(slug);
    const conflict = this.store.filter<Campaign>(
      'campaigns',
      (c) => c.partner_id === partnerId && c.slug === slug,
    )[0];
    if (conflict) {
      throw new ConflictException(`Campaign slug "${slug}" already exists for this partner.`);
    }
    const now = new Date().toISOString();
    return this.store.create<Campaign>('campaigns', {
      id: this.store.randomId('cmp'),
      object: 'campaign',
      partner_id: partnerId,
      name: data.name,
      slug,
      utm_source: data.utm_source ?? null,
      utm_medium: data.utm_medium ?? null,
      status: 'active',
      created_at: now,
      updated_at: now,
    });
  }

  listCampaigns(partnerId: string): Campaign[] {
    return this.store.filter<Campaign>('campaigns', (c) => c.partner_id === partnerId);
  }

  getCampaign(id: string): Campaign | null {
    return this.store.get<Campaign>('campaigns', id);
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  private normalizeSlug(raw: string): string {
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private validateSlug(slug: string): void {
    if (!SLUG_RE.test(slug)) {
      throw new BadRequestException(
        'Slug must be 3-50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphen.',
      );
    }
  }
}
