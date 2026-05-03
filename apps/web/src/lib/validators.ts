/**
 * Security-critical input validators.
 *
 * Centralised so every server action and route handler uses the same
 * allow-list semantics. These helpers are pure (no I/O, no globals) and
 * carry direct unit tests in `validators.test.ts`.
 */

/**
 * Accept a candidate URL only if it parses cleanly and uses `http:` or
 * `https:`. Returns the canonicalised URL string, or `null` if the input
 * fails any check.
 *
 * Rejects (returns `null`):
 *   - falsy input (`''`, `null`, `undefined`)
 *   - non-http(s) schemes — including `javascript:`, `data:`, `file:`,
 *     `vbscript:`, custom app schemes
 *   - URLs that carry credentials (`https://user:pass@host`) — these can
 *     spoof origin in some UI surfaces and exfiltrate session via referrer
 *   - inputs that fail to parse as a URL at all
 *
 * Scope: this validator is for **rendering-time** URLs (e.g. `<img src>`
 * targets supplied by users). It does NOT defend against SSRF and must
 * not be used to gate server-side fetches — those need an additional
 * DNS-pinned host allow-list (see ROADMAP Phase 7+ note).
 */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}
