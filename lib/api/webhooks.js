/**
 * Webhook signing + dispatch.
 *
 * Signature scheme (documented + verifiable in the portal):
 *   Webhook-Signature: t=<unix>,v1=<hmac_sha256(secret, t + "." + body)>
 *
 * dispatch() attempts a real POST with a ~3s timeout and always records a
 * Delivery row — it never throws on an unreachable target.
 */

import { createHmac } from 'node:crypto';
import { getStore, create, createCapped, filter, randomId } from './store.js';
import { checkUrl } from './urlguard.js';

const TIMEOUT_MS = 3000;

/** Compute the `t=...,v1=...` signature header value for a body. */
export function sign(secret, body, t) {
  const mac = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${mac}`;
}

/** A webhook record safe for list responses (secret masked). */
export function publicWebhook(webhook) {
  return { ...webhook, secret: maskWebhookSecret(webhook.secret) };
}

/** Mask a signing secret: `whsec_...a1b2`. */
export function maskWebhookSecret(secret) {
  if (!secret) return secret;
  return `whsec_...${String(secret).slice(-4)}`;
}

/**
 * Build, sign and attempt delivery of an event to one webhook endpoint.
 * @returns {Promise<{delivery: object, evt: object, signature: string}>}
 */
export async function dispatch(webhook, event, payload) {
  const evt = {
    id: randomId('evt'),
    type: event,
    created_at: new Date().toISOString(),
    data: payload,
  };
  const body = JSON.stringify(evt);
  const t = Math.floor(Date.now() / 1000);
  const signature = sign(webhook.secret, body, t);

  // Re-validate the target at dispatch time (defense in depth against a
  // stored URL that would fail today's guard).
  const guard = checkUrl(webhook.url);

  let status = 'failed';
  let latency_ms = 0;
  const started = Date.now();
  if (!guard.ok) {
    // Refuse to even attempt an unsafe target.
    latency_ms = 0;
  } else {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
  }
  latency_ms = Date.now() - started;

  const delivery = createCapped('deliveries', {
    id: randomId('del'),
    object: 'delivery',
    webhook_id: webhook.id,
    url: webhook.url,
    event,
    payload: evt,
    signature,
    status,
    attempts: 1,
    at: new Date().toISOString(),
    latency_ms,
  });

  return { delivery, evt, signature };
}

/**
 * Fire-and-forget fan-out of an event to every active webhook subscribed to it.
 * Never throws; deliveries are recorded asynchronously.
 * @returns {number} number of endpoints dispatched to.
 */
export function emit(event, payload) {
  const targets = filter('webhooks', (w) => w.active && (w.events.includes('*') || w.events.includes(event)));
  for (const webhook of targets) {
    dispatch(webhook, event, payload).catch(() => {});
  }
  return targets.length;
}

/** All supported webhook event types. */
export const SUPPORTED_EVENTS = [
  'position.opened',
  'position.active',
  'position.rebalanced',
  'position.withdrawn',
  'position.closed',
  'yield.threshold',
  'system.status',
];

/** Convenience: list deliveries, optionally filtered by webhook. */
export function listDeliveries(webhookId) {
  const all = getStore().deliveries;
  return webhookId ? all.filter((d) => d.webhook_id === webhookId) : all;
}
