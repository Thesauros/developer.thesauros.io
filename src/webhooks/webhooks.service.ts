import { createHmac } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { CryptoService } from '../crypto/crypto.service';
import { checkUrl } from './url-guard';

/** Mirrors the sandbox's SUPPORTED_EVENTS so payload contracts stay identical. */
export const SUPPORTED_EVENTS = [
  'position.opened',
  'position.active',
  'position.rebalanced',
  'position.withdrawn',
  'position.closed',
  'yield.threshold',
  'system.status',
] as const;

const DELIVERY_TIMEOUT_MS = 3000;

/** Deliveries kept per partner; old rows beyond this are pruned on insert. */
const DELIVERY_RETENTION_PER_PARTNER = 500;

export interface Webhook {
  id: string;
  object: string;
  partner_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  created_at: string;
  [key: string]: unknown;
}

export interface WebhookDelivery {
  id: string;
  object: string;
  webhook_id: string;
  partner_id: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
  signature: string;
  status: string;
  attempts: number;
  at: string;
  latency_ms: number;
  [key: string]: unknown;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly store: StoreService,
    private readonly crypto: CryptoService,
  ) {}

  /** `Webhook-Signature: t=<unix>,v1=<hmac_sha256(secret, t + "." + body)>` — sandbox scheme, verbatim. */
  sign(secret: string, body: string, t: number): string {
    const mac = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    return `t=${t},v1=${mac}`;
  }

  maskSecret(secret: string): string {
    const plain = this.crypto.decrypt(secret);
    return `whsec_...${String(plain).slice(-4)}`;
  }

  /** Webhook record safe for list responses (secret masked). */
  publicWebhook(webhook: Webhook): Webhook {
    return { ...webhook, secret: this.maskSecret(webhook.secret) };
  }

  assertSafeUrl(raw: string): string {
    const result = checkUrl(raw);
    if (!result.ok) throw new BadRequestException(result.reason);
    return result.url;
  }

  validateEvents(events: unknown): string[] {
    if (events == null) return ['*'];
    if (!Array.isArray(events) || events.length === 0) {
      throw new BadRequestException('events must be a non-empty array.');
    }
    for (const event of events) {
      if (event !== '*' && !SUPPORTED_EVENTS.includes(event)) {
        throw new BadRequestException(
          `Unsupported event "${event}". Supported: ${SUPPORTED_EVENTS.join(', ')}.`,
        );
      }
    }
    return events as string[];
  }

  async createWebhook(partnerId: string, url: string, events: string[], active: boolean): Promise<{ webhook: Webhook; plainSecret: string }> {
    const plainSecret = this.store.randomId('whsec', 16);
    const webhook = await this.store.create<Webhook>('webhooks', {
      id: this.store.randomId('wh'),
      object: 'webhook',
      partner_id: partnerId,
      url,
      events,
      secret: this.crypto.encrypt(plainSecret),
      active,
      created_at: new Date().toISOString(),
    });
    return { webhook, plainSecret };
  }

  async listWebhooks(partnerId: string): Promise<Webhook[]> {
    return this.store.filter<Webhook>('webhooks', (w) => w.partner_id === partnerId);
  }

  async getWebhook(partnerId: string, id: string): Promise<Webhook | null> {
    const webhook = await this.store.get<Webhook>('webhooks', id);
    return webhook && webhook.partner_id === partnerId ? webhook : null;
  }

  async updateWebhook(webhook: Webhook, patch: Partial<Webhook>): Promise<Webhook | null> {
    return this.store.update<Webhook>('webhooks', webhook.id, patch);
  }

  async deleteWebhook(webhook: Webhook): Promise<boolean> {
    return this.store.remove('webhooks', webhook.id);
  }

  async listDeliveries(partnerId: string, webhookId?: string, limit = 50): Promise<WebhookDelivery[]> {
    const deliveries = await this.store.filter<WebhookDelivery>(
      'webhookDeliveries',
      (d) => d.partner_id === partnerId && (!webhookId || d.webhook_id === webhookId),
    );
    // timestamptz columns hydrate as Date objects, not strings — compare epochs.
    return deliveries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
  }

  /**
   * Build, sign and attempt delivery of one event to one endpoint. Always
   * records a delivery row; never throws on an unreachable target — the
   * sandbox contract ("attempts a real POST with a ~3s timeout and always
   * records a Delivery row").
   */
  async dispatch(webhook: Webhook, event: string, payload: Record<string, unknown>): Promise<WebhookDelivery> {
    const evt = {
      id: this.store.randomId('evt'),
      type: event,
      created_at: new Date().toISOString(),
      data: payload,
    };
    const body = JSON.stringify(evt);
    const t = Math.floor(Date.now() / 1000);
    const signature = this.sign(this.crypto.decrypt(webhook.secret), body, t);

    // Re-validate at dispatch time: defense in depth against a stored URL
    // that would fail today's guard.
    const guard = checkUrl(webhook.url);

    let status = 'failed';
    let latency_ms = 0;
    const started = Date.now();
    if (guard.ok) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Webhook-Signature': signature,
            'User-Agent': 'Thesauros-Webhook/1.0',
          },
          body,
          signal: controller.signal,
          // Never follow redirects — a 3xx must not bounce us to a blocked host.
          redirect: 'error',
        });
        clearTimeout(timer);
        status = res.ok ? 'delivered' : 'failed';
      } catch {
        status = 'failed'; // unreachable / timeout / DNS / blocked redirect — recorded, not thrown
      }
      latency_ms = Date.now() - started;
    }

    const delivery = await this.store.create<WebhookDelivery>('webhookDeliveries', {
      id: this.store.randomId('del'),
      object: 'delivery',
      webhook_id: webhook.id,
      partner_id: webhook.partner_id,
      url: webhook.url,
      event,
      payload: evt,
      signature,
      status,
      attempts: 1,
      at: new Date().toISOString(),
      latency_ms,
    });

    await this.pruneDeliveries(webhook.partner_id);
    return delivery;
  }

  /**
   * Fire-and-forget fan-out of an event to every active endpoint of a partner
   * subscribed to it. Never throws.
   */
  async emit(partnerId: string, event: string, payload: Record<string, unknown>): Promise<number> {
    const targets = await this.store.filter<Webhook>(
      'webhooks',
      (w) => w.partner_id === partnerId && w.active && (w.events.includes('*') || w.events.includes(event)),
    );
    for (const webhook of targets) {
      this.dispatch(webhook, event, payload).catch((error) => {
        this.logger.warn(`Webhook dispatch failed for ${webhook.id}: ${error.message}`);
      });
    }
    return targets.length;
  }

  private async pruneDeliveries(partnerId: string): Promise<void> {
    try {
      const rows = await this.store.filter<WebhookDelivery>('webhookDeliveries', (d) => d.partner_id === partnerId);
      if (rows.length <= DELIVERY_RETENTION_PER_PARTNER) return;
      const excess = rows.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()).slice(0, rows.length - DELIVERY_RETENTION_PER_PARTNER);
      for (const row of excess) {
        await this.store.remove('webhookDeliveries', row.id);
      }
    } catch (error) {
      this.logger.warn(`Delivery pruning failed: ${(error as Error).message}`);
    }
  }
}
