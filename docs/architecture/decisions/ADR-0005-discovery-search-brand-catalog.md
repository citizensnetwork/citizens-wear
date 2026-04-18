# ADR-0005 — Discovery, search, and the brand catalog

- **Status:** Accepted (Phase 5)
- **Date:** 2026-04-18
- **Deciders:** Citizens Network / Citizens Wear maintainers
- **Supersedes:** none
- **Superseded by:** none

## Context

Phase 5 of `docs/rollout-plan.md` lands the discovery surface: an Explore
hub, unified Search, hashtag feeds, and a Shop/Drops/Posts surface on each
brand profile. Until now, Citizens Wear has been a closed loop — to find
anything you had to know its slug or handle. To grow the platform without
betraying its anti-surveillance posture, we need _discovery_ that is
content-driven and _search_ that is request-scoped, never tracked.

We also extend the Citizens Connect contract: brands and products gain
`search`, and the Wear store gains text + hashtag search and a trending
ranker. None of this changes how Connect issues identity or how Wear
authenticates — it strictly adds read paths.

## Decision

### 1. Discovery is read-only and request-scoped

`/explore` and `/search` execute fan-out reads in `Promise.all`, render
server-side, and store nothing about the request beyond the existing
session cookie. There is no client-side search bundle, no recommendation
log, no per-user "what you searched" history. This is a deliberate
counterweight to the surveillance norms of mainstream social platforms.

### 2. Search lives behind the contract, not the call site

We extend the Connect contract with `BrandDirectory.search` and
`ProductCatalog.search`. The mock implements case-insensitive substring
matching across the obvious fields (`name`, `slug`, `tagline` for brands;
`title`, `description` for products). The HTTP client maps both to
`/v1/{brands,products}/search?q=…` so the live Connect service can swap
in a real index without touching consumers. Every call site programs
against the interface — exactly the same pattern as the rest of the
contract.

### 3. Hashtags are derived, not stored separately

Posts continue to carry only their body. A `hashtags` module in
`@citizens-wear/db` extracts `#token` matches with a Unicode-aware regex
that requires a non-word boundary before `#` so `salt#tee` does **not**
parse as a hashtag. Extraction is deterministic, lower-cased, and
de-duplicated per post. The Postgres-backed implementation that lands
later can either run the same extractor at write-time into a join table
or use a `tsvector` GIN index — either way the contract is unchanged.

`PostRepo` gains three methods:

- `searchByText(query, params)` — chronological substring match on the
  body. Empty query → empty page (an explicit no-op rather than a "list
  everything" footgun).
- `listByHashtag(tag, params)` — matches `tag` against extracted
  hashtags; accepts `kingdom`, `#kingdom`, or `Kingdom` (normalised).
- `trendingHashtags({ limit, windowMs })` — ranks hashtags by post count
  with a freshness boost over the last 14 days by default.

### 4. The UI grows three new server-rendered routes

- `/explore` — trending hashtags, featured brands, suggested citizens,
  fresh drops, and a "from the feed" strip. Anonymous viewers see a
  public seed identity so the page is never empty.
- `/search` — `?q=…&kind=…` with kinds `top|citizens|brands|hashtags|posts|drops`.
  Inputs are trimmed, capped at 100 chars, and validated as a closed
  enum on the server. The form uses GET so it is bookmarkable and works
  without JavaScript.
- `/h/[tag]` — full hashtag feed; the page decodes the URI, normalises
  with `normaliseHashtag`, and 404s on an empty result of normalisation.

The `PageShell` gains an Explore link and a small header search box that
posts to `/search`. `PostCard` linkifies hashtags with a Unicode-aware
splitter; the body renders as a sequence of plain-text spans and `<Link>`
nodes — React escapes the text segments so untrusted post bodies stay
XSS-safe.

### 5. Brand profile becomes Drops + Posts tabs

`/b/[slug]?tab=posts` shows the brand's posts (via the existing
`listByBrand`) re-using the same `PostCard`. `?tab=drops` (default) keeps
the catalog view, now showing product descriptions as well. The tab is a
closed enum validated on the server.

### 6. Security & UX guards

- Query length capped at 100 characters before any search call.
- `kind` and `tab` parameters validated against closed string enums.
- All new pages re-authenticate via `getSession()`; nothing trusts the
  URL for identity.
- Pagination caps remain `1 ≤ limit ≤ 50` (Wear) and `1 ≤ limit ≤ 100`
  (Connect) and reject malformed cursors with typed errors.
- All discovery reads run in parallel with `Promise.all`, avoiding
  per-item N+1 fan-out (the Explore "fresh drops" strip caps the number
  of brands it samples and the post enrichment block uses one
  `Promise.all` per post).
- A11y: every search field has an associated `<label>` (visually hidden
  via `sr-only` where appropriate); tab navigation uses `aria-current`;
  hashtag/brand "✓" badges still expose `aria-label`.
- No new client bundles, no new third-party dependencies, no new
  telemetry surfaces.

## Consequences

- The `ConnectClient` interface is wider; both implementations and their
  contract tests now cover the new search methods.
- The Wear store gains a small Unicode-aware extractor that the future
  Postgres implementation must reproduce verbatim. The shared
  `extractHashtags`/`normaliseHashtag` helpers live in `@citizens-wear/db`
  precisely so both implementations can call the same code.
- Discovery is intentionally limited to the existing fixture set in mock
  mode; production search quality is a function of Citizens Connect's
  search service and a real Postgres-backed `WearStore`.
- Future Phase 8+ work can replace `searchByText` with Postgres
  full-text or an external index without changing any caller — they all
  program against `PostRepo`.

## Status of the rollout plan

`docs/rollout-plan.md` Phase 5 is now landed. Phase 6 (Stories & DMs)
is unblocked and will introduce the realtime layer; ARCH-GATE 3 will
follow at the end of Phase 6.
