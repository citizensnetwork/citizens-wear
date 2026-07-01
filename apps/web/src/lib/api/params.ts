import type { PageParams } from '@citizens-wear/db';

/** Parse `?cursor=&limit=` into store `PageParams` (bad values are dropped). */
export function readPageParams(url: URL): PageParams {
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw !== null && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;
  return { ...(cursor ? { cursor } : {}), ...(limit ? { limit } : {}) };
}

/** Read+trim a string field from a parsed JSON body (returns '' if absent). */
export function bodyString(body: unknown, key: string): string {
  if (body && typeof body === 'object' && key in body) {
    const v = (body as Record<string, unknown>)[key];
    return typeof v === 'string' ? v.trim() : '';
  }
  return '';
}

/** Read a string[] field from a parsed JSON body. */
export function bodyStringArray(body: unknown, key: string): string[] {
  if (body && typeof body === 'object' && key in body) {
    const v = (body as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

/** Safely parse a request JSON body, returning `{}` on any error. */
export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
