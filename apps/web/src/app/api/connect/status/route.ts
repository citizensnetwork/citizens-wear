import { NextResponse } from 'next/server';
import { getConnectClient } from '@/lib/connect';

export const dynamic = 'force-dynamic';

export async function GET() {
  const client = getConnectClient();
  try {
    const status = await client.healthCheck();
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        ok: false,
        mode: 'mock' as const,
        checkedAt: new Date().toISOString(),
        message,
      },
      { status: 503 },
    );
  }
}
