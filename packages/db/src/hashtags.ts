/**
 * Hashtag extraction shared by the in-memory store and any future
 * Postgres-backed implementation.
 *
 * Rules:
 *   - A hashtag is `#` followed by 1–64 Unicode letters/numbers/`_`.
 *   - Case-insensitive: stored and compared in lowercase.
 *   - Duplicates within the same post are de-duped.
 *   - We deliberately do NOT match leading characters that look like a
 *     hashtag but are part of a word (e.g. `salt#tee`); the regex requires
 *     a non-word character (or start-of-string) before the `#`.
 */

const HASHTAG_RE = /(?:^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]{1,64})/gu;

export function extractHashtags(body: string): readonly string[] {
  if (!body) return [];
  const seen = new Set<string>();
  for (const match of body.matchAll(HASHTAG_RE)) {
    const raw = match[1];
    if (!raw) continue;
    seen.add(raw.toLowerCase());
  }
  return [...seen];
}

/** Normalise user input ("Kingdom", "#kingdom", "  KINGDOM  ") to "kingdom". */
export function normaliseHashtag(input: string): string {
  return input.trim().replace(/^#/, '').toLowerCase();
}
