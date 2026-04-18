import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ConnectEvent } from '../contract';
import { ConnectError } from '../contract';

/**
 * Citizens Connect webhook receiver support.
 *
 * Connect delivers domain events (`user.updated`, `brand.updated`,
 * `product.updated`, `product.stock_changed`) over HTTPS. This module gives
 * the Next.js route handler in `apps/web/src/app/api/connect/webhook`
 * everything it needs to accept deliveries idempotently and reject forgeries
 * / replays — the actual HTTP plumbing lives in the route so we can keep
 * this package runtime-agnostic.
 *
 * Security properties:
 *
 *   1. **Authenticity.** The delivery carries an `x-connect-signature`
 *      header of the form `t=<unix-seconds>,v1=<hex-hmac>`. `v1` is an
 *      HMAC-SHA256 over `${t}.${rawBody}` keyed by a shared secret. We
 *      compare in constant time.
 *
 *   2. **Freshness.** `t` must be within `MAX_SKEW_SECONDS` of `now`.
 *      Older deliveries are rejected so a captured signature can't be
 *      replayed indefinitely.
 *
 *   3. **Idempotency.** Every delivery carries an `x-connect-delivery-id`.
 *      The `DeliveryLog` remembers ids we've already accepted and drops
 *      duplicates — safe because downstream handlers apply idempotent
 *      upserts, but we also don't want to publish the same event twice
 *      into the `EventBus`.
 *
 *   4. **Shape.** The body is parsed as `{ deliveryId, event }` and the
 *      event is validated against the `ConnectEvent` discriminated union
 *      before being handed to any subscriber.
 */

/** Maximum clock skew (seconds) we accept between Connect and Wear. */
export const MAX_SKEW_SECONDS = 5 * 60;

/** Header carrying the HMAC signature. */
export const CONNECT_SIGNATURE_HEADER = 'x-connect-signature';
/** Header carrying the unique delivery id (used for idempotency). */
export const CONNECT_DELIVERY_ID_HEADER = 'x-connect-delivery-id';

export interface WebhookPayload {
  readonly deliveryId: string;
  readonly event: ConnectEvent;
}

/** An idempotency log for accepted webhook deliveries. */
export interface DeliveryLog {
  /**
   * Atomically record `id` as seen. Returns `true` if this is the first
   * time we've seen it (caller should process the event) or `false` if
   * the delivery is a replay (caller should 200 without processing).
   */
  markSeen(id: string): Promise<boolean>;
}

/**
 * In-memory, process-local `DeliveryLog`. Acceptable for single-instance
 * deployments — multi-instance rollouts in Phase 9 must back this with
 * Redis or the primary database.
 */
export class MemoryDeliveryLog implements DeliveryLog {
  private readonly _seen = new Set<string>();
  private readonly _order: string[] = [];
  private readonly _capacity: number;

  public constructor(capacity = 10_000) {
    this._capacity = Math.max(1, capacity);
  }

  public async markSeen(id: string): Promise<boolean> {
    if (this._seen.has(id)) return false;
    this._seen.add(id);
    this._order.push(id);
    if (this._order.length > this._capacity) {
      const evicted = this._order.shift();
      if (evicted) this._seen.delete(evicted);
    }
    return true;
  }
}

/**
 * Produce a Connect-style signature header value for `rawBody` at time `t`.
 * Exported so tests and Connect's own SDK can share one implementation.
 */
export function signWebhookBody(secret: string, rawBody: string, t: number): string {
  const mac = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return `t=${t},v1=${mac}`;
}

function parseSignatureHeader(header: string): { readonly t: number; readonly v1: string } | null {
  let t: number | null = null;
  let v1: string | null = null;
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (!key || !value) continue;
    if (key.trim() === 't') {
      const parsed = Number.parseInt(value.trim(), 10);
      if (!Number.isNaN(parsed)) t = parsed;
    } else if (key.trim() === 'v1') {
      v1 = value.trim();
    }
  }
  if (t === null || v1 === null) return null;
  return { t, v1 };
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export interface VerifyOptions {
  readonly secret: string;
  readonly rawBody: string;
  readonly signatureHeader: string | null | undefined;
  readonly now?: () => Date;
  readonly maxSkewSeconds?: number;
}

/**
 * Verify a raw webhook delivery's signature + freshness. Throws
 * `ConnectError` on any failure; callers should map that to a 400/401.
 */
export function verifyWebhookSignature(opts: VerifyOptions): void {
  if (!opts.secret) {
    throw new ConnectError('misconfigured', 'Webhook secret is not configured.', 500);
  }
  if (!opts.signatureHeader) {
    throw new ConnectError('missing_signature', 'Missing webhook signature header.', 401);
  }
  const parsed = parseSignatureHeader(opts.signatureHeader);
  if (!parsed) {
    throw new ConnectError('bad_signature', 'Malformed webhook signature header.', 401);
  }
  const nowSec = Math.floor((opts.now?.() ?? new Date()).getTime() / 1000);
  const skew = Math.abs(nowSec - parsed.t);
  if (skew > (opts.maxSkewSeconds ?? MAX_SKEW_SECONDS)) {
    throw new ConnectError(
      'expired_signature',
      'Webhook signature is outside the skew window.',
      401,
    );
  }
  const expected = createHmac('sha256', opts.secret)
    .update(`${parsed.t}.${opts.rawBody}`)
    .digest('hex');
  if (!safeEqualHex(expected, parsed.v1)) {
    throw new ConnectError('bad_signature', 'Webhook signature did not verify.', 401);
  }
}

/**
 * Validate a parsed webhook body and narrow it to `WebhookPayload`. Keeps
 * the route handler focused on HTTP concerns.
 */
export function parseWebhookPayload(raw: unknown): WebhookPayload {
  if (!raw || typeof raw !== 'object') {
    throw new ConnectError('invalid_payload', 'Webhook payload must be a JSON object.', 400);
  }
  const obj = raw as Record<string, unknown>;
  const deliveryId = typeof obj.deliveryId === 'string' ? obj.deliveryId : null;
  const event = obj.event;
  if (!deliveryId) {
    throw new ConnectError('invalid_payload', 'Webhook payload missing deliveryId.', 400);
  }
  if (!event || typeof event !== 'object') {
    throw new ConnectError('invalid_payload', 'Webhook payload missing event.', 400);
  }
  if (!isValidConnectEvent(event)) {
    throw new ConnectError('invalid_event', 'Unknown or malformed event shape.', 400);
  }
  return { deliveryId, event };
}

function isValidConnectEvent(event: unknown): event is ConnectEvent {
  if (!event || typeof event !== 'object') return false;
  const type = (event as { type?: unknown }).type;
  switch (type) {
    case 'user.updated':
      return typeof (event as { user?: unknown }).user === 'object';
    case 'brand.updated':
      return typeof (event as { brand?: unknown }).brand === 'object';
    case 'product.updated':
      return typeof (event as { product?: unknown }).product === 'object';
    case 'product.stock_changed': {
      const e = event as { productId?: unknown; stockState?: unknown };
      return (
        typeof e.productId === 'string' &&
        (e.stockState === 'in_stock' ||
          e.stockState === 'low' ||
          e.stockState === 'sold_out' ||
          e.stockState === 'preorder')
      );
    }
    default:
      return false;
  }
}
