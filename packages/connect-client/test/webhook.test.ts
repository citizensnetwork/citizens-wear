import { describe, expect, it } from 'vitest';
import {
  ConnectError,
  MemoryDeliveryLog,
  parseWebhookPayload,
  signWebhookBody,
  verifyWebhookSignature,
} from '../src/index';

const SECRET = 'whsec_test_abc';

describe('signWebhookBody / verifyWebhookSignature', () => {
  it('accepts a signature produced by the same secret + body + timestamp', () => {
    const t = 1_800_000_000;
    const body = '{"hello":"world"}';
    const sig = signWebhookBody(SECRET, body, t);
    verifyWebhookSignature({
      secret: SECRET,
      rawBody: body,
      signatureHeader: sig,
      now: () => new Date(t * 1000),
    });
  });

  it('rejects a signature with a tampered body', () => {
    const t = 1_800_000_000;
    const sig = signWebhookBody(SECRET, 'original', t);
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: 'tampered',
        signatureHeader: sig,
        now: () => new Date(t * 1000),
      }),
    ).toThrowError(ConnectError);
  });

  it('rejects a signature that has drifted outside the skew window', () => {
    const t = 1_800_000_000;
    const sig = signWebhookBody(SECRET, 'body', t);
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: 'body',
        signatureHeader: sig,
        now: () => new Date((t + 10 * 60) * 1000),
      }),
    ).toThrow(expect.objectContaining({ code: 'expired_signature' }) as unknown as Error);
  });

  it('rejects a malformed signature header', () => {
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: 'body',
        signatureHeader: 'not-a-signature',
        now: () => new Date(),
      }),
    ).toThrowError(ConnectError);
  });

  it('rejects a missing signature header', () => {
    expect(() =>
      verifyWebhookSignature({
        secret: SECRET,
        rawBody: 'body',
        signatureHeader: null,
        now: () => new Date(),
      }),
    ).toThrow(expect.objectContaining({ code: 'missing_signature' }) as unknown as Error);
  });

  it('rejects when the secret is empty (misconfigured)', () => {
    expect(() =>
      verifyWebhookSignature({
        secret: '',
        rawBody: 'body',
        signatureHeader: signWebhookBody('x', 'body', 1),
        now: () => new Date(1000),
      }),
    ).toThrow(expect.objectContaining({ code: 'misconfigured' }) as unknown as Error);
  });
});

describe('parseWebhookPayload', () => {
  it('narrows a valid product.stock_changed payload', () => {
    const payload = parseWebhookPayload({
      deliveryId: 'dlv_1',
      event: { type: 'product.stock_changed', productId: 'prd_001', stockState: 'low' },
    });
    expect(payload.deliveryId).toBe('dlv_1');
    expect(payload.event.type).toBe('product.stock_changed');
  });

  it('rejects unknown event types', () => {
    expect(() =>
      parseWebhookPayload({
        deliveryId: 'd',
        event: { type: 'users.deleted' },
      }),
    ).toThrow(
      expect.objectContaining({ name: 'ConnectError', code: 'invalid_event' }) as unknown as Error,
    );
  });

  it('rejects payloads missing a deliveryId', () => {
    expect(() =>
      parseWebhookPayload({
        event: { type: 'user.updated', user: {} },
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_payload' }) as unknown as Error);
  });
});

describe('MemoryDeliveryLog', () => {
  it('reports first-seen vs replay', async () => {
    const log = new MemoryDeliveryLog();
    expect(await log.markSeen('dlv_1')).toBe(true);
    expect(await log.markSeen('dlv_1')).toBe(false);
    expect(await log.markSeen('dlv_2')).toBe(true);
  });

  it('evicts old ids once capacity is exceeded', async () => {
    const log = new MemoryDeliveryLog(2);
    await log.markSeen('a');
    await log.markSeen('b');
    await log.markSeen('c');
    expect(await log.markSeen('a')).toBe(true); // evicted, now fresh
    expect(await log.markSeen('c')).toBe(false); // still remembered
  });
});
