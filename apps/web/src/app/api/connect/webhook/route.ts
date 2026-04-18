import { NextResponse } from 'next/server';
import {
  CONNECT_DELIVERY_ID_HEADER,
  CONNECT_SIGNATURE_HEADER,
  ConnectError,
  parseWebhookPayload,
  verifyWebhookSignature,
} from '@citizens-wear/connect-client';
import { getConnectClient } from '@/lib/connect';
import { getDeliveryLog } from '@/lib/webhook-log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Citizens Connect → Citizens Wear webhook receiver.
 *
 * Responsibilities (see ADR-0004 / ARCH-GATE 2):
 *
 *   1. Verify the HMAC-SHA256 signature in `x-connect-signature`, rejecting
 *      forgeries and replays outside the skew window.
 *   2. Dedupe deliveries by `x-connect-delivery-id` via an in-memory log so
 *      retries from Connect are safe.
 *   3. Parse and narrow the event payload, then fan it out through the
 *      shared `ConnectClient.events` bus so any in-process subscriber (e.g.
 *      cache invalidators, feed fan-out workers) sees it exactly once.
 *
 * The receiver always returns `200` for successfully-verified replays so
 * Connect does not retry. All verification failures return `4xx`.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.CONNECT_WEBHOOK_SECRET ?? '';
  const rawBody = await request.text();

  try {
    verifyWebhookSignature({
      secret,
      rawBody,
      signatureHeader: request.headers.get(CONNECT_SIGNATURE_HEADER),
    });
  } catch (error) {
    return errorResponse(error);
  }

  const deliveryId =
    request.headers.get(CONNECT_DELIVERY_ID_HEADER) ?? safeDeliveryIdFromBody(rawBody);
  if (!deliveryId) {
    return NextResponse.json(
      { ok: false, code: 'missing_delivery_id', message: 'Missing delivery id.' },
      { status: 400 },
    );
  }

  let payload;
  try {
    payload = parseWebhookPayload(JSON.parse(rawBody));
  } catch (error) {
    return errorResponse(error);
  }

  const isFresh = await getDeliveryLog().markSeen(deliveryId);
  if (!isFresh) {
    return NextResponse.json({ ok: true, deduplicated: true }, { status: 200 });
  }

  await getConnectClient().events.publish(payload.event);
  return NextResponse.json({ ok: true, deduplicated: false }, { status: 200 });
}

function safeDeliveryIdFromBody(rawBody: string): string | null {
  try {
    const body = JSON.parse(rawBody) as { deliveryId?: unknown };
    return typeof body.deliveryId === 'string' ? body.deliveryId : null;
  } catch {
    return null;
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof ConnectError) {
    return NextResponse.json(
      { ok: false, code: error.code, message: error.message },
      { status: error.status ?? 400 },
    );
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  return NextResponse.json({ ok: false, code: 'internal_error', message }, { status: 500 });
}
