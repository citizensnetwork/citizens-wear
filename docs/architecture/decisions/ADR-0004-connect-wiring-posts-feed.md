# ADR-0004 — ARCH-GATE 2: Connect wiring, posts, and the feed

- **Status:** Accepted (Phase 3 + Phase 4 / ARCH-GATE 2)
- **Date:** 2026-04-18
- **Deciders:** Citizens Network / Citizens Wear maintainers
- **Supersedes:** none
- **Superseded by:** none

## Context

Phase 3 of the rollout (`docs/rollout-plan.md`) wires Citizens Wear to the real Citizens Connect, and Phase 4 lands the social core: posts, feed, post detail, likes, threaded comments, saves, and a brand composer. This ADR records the ARCH-GATE 2 review that the rollout plan schedules at the end of Phase 4.

Phase 2 left us with:

- `@citizens-wear/connect-client` programming against an interface, with `MockConnectClient` as the only implementation (ADR-0002, ADR-0003).
- `@citizens-wear/db` with a `WearStore` contract + `MemoryWearStore`, carrying profiles, follows, and settings (ADR-0003).
- Cookie-backed sessions that never parse the Connect token themselves.

ARCH-GATE 2 must answer:

1. How does Wear call the real Citizens Connect service, and how does that switch roll back safely to the mock?
2. How do we receive domain events from Connect without being spoofed or duplicated?
3. What does the Wear-owned post model look like, and how does the feed query stay cheap as it grows?
4. How do we keep render paths free of N+1 patterns while still showing per-post signals (likes, comments, saves)?
5. Where do image pipelines, moderation hooks, and the ranker plug in later without churning the contract?

## Decision

### 1. Connect contract has one interface, two implementations

`@citizens-wear/connect-client` exports:

- `MockConnectClient` — unchanged from Phase 1/2, backed by hand-written fixtures.
- `HttpConnectClient` — a new fetch-based implementation that targets `{baseUrl}/v1/...`, carries an optional service API key via `x-connect-api-key`, and forwards the user's session token via `Authorization: Bearer <token>` on auth endpoints only.
- `createConnectClient({ mode, baseUrl, apiKey })` — the single factory callers use. It returns the HTTP client only when `mode === 'live'` **and** a `baseUrl` is configured; otherwise it falls back to the mock. This keeps misconfigured deployments bootable and visible via `/api/connect/status` (which reports `mode: 'mock'`).

Both implementations satisfy identical contract tests. The HTTP client's tests use an injected `fetch` so we can assert URL shapes, header handling, 404→`null` narrowing, and `ConnectError` propagation without a live server.

`HttpConnectClient` deliberately does not invent any Connect surface beyond what the interface exposes. When Connect grows new capabilities, we amend the contract (with a follow-up ADR) before either client gets a new method.

### 2. SSO parity is Auth.js-shaped today

Wear exposes `/api/auth/callback/connect` that accepts a Connect-issued token via either `GET ?token=...&next=/...` (OIDC redirect flow) or `POST` form (service-to-service). The route:

1. Verifies the token via `client.auth.verifyToken` — Wear never parses the token.
2. Resolves the user via `client.auth.getCurrentUser`; a missing user means the session was revoked upstream.
3. Writes the `cw_session` cookie and 302s to a sanitised `next` path (path-only, must start with `/` and not `//`) to prevent open redirects.

The URL shape matches Auth.js's `/api/auth/callback/<provider>` convention, so adopting Auth.js proper in a later phase is a drop-in configuration change — no consumer touches `getSession()`.

### 3. Webhooks are signed, fresh, and deduped

Connect publishes domain events (`user.updated`, `brand.updated`, `product.updated`, `product.stock_changed`) to `/api/connect/webhook` on Wear. The handler is non-negotiable on four properties:

1. **Authenticity.** Header `x-connect-signature: t=<unix-seconds>,v1=<hex-hmac>` where `v1` is HMAC-SHA256 over `${t}.${rawBody}`, keyed by `CONNECT_WEBHOOK_SECRET`. Comparison is constant-time (`crypto.timingSafeEqual`).
2. **Freshness.** `|now - t| ≤ MAX_SKEW_SECONDS` (default 300). This prevents captured signatures from being replayed indefinitely.
3. **Idempotency.** Header `x-connect-delivery-id` is recorded in a `DeliveryLog`. The in-memory `MemoryDeliveryLog` is a bounded ring (evicting oldest) and is sufficient for single-instance deployments; multi-instance rollouts in Phase 9 will back this with Redis.
4. **Shape.** `{ deliveryId, event }` is parsed and the event is narrowed against the `ConnectEvent` discriminated union before `client.events.publish` fans it out. Unknown event types return `400` — Connect's contract tests guarantee forward compatibility, so new event types come with coordinated releases.

Verification failures return the correct `4xx`; accepted-but-duplicate deliveries return `200 { deduplicated: true }` so Connect stops retrying. Handlers invoked through `events.publish` must remain idempotent at the data layer.

### 4. The post model keeps Wear-owned state separate from Connect

New tables (`prisma/schema.prisma`) all hang off `User` and `Brand` ids that Connect owns. The primary-key choices are:

- `Post` — surrogate id. `(authorId, createdAt desc)` and `(brandId, createdAt desc)` indexes for profile/brand timelines; global `(createdAt desc)` index for the explore surfaces that land in Phase 5.
- `Like` — composite PK `(postId, userId)` — idempotent likes come for free. A secondary index on `(userId, createdAt desc)` powers the activity tab without scanning.
- `Comment` — surrogate id, `parentCommentId` self-reference for threading. `(postId, createdAt)` for rendering and `(authorId, createdAt desc)` for the activity tab.
- `CommentLike` — composite PK `(commentId, userId)`, same idempotency story as `Like`.
- `SaveCollection` — every user gets an implicit `default` collection on first save; named collections land with Phase 7. `(ownerId, name)` is unique. `SavedPost` composite PK `(collectionId, postId)`.
- `PostMedia` — ordered by `orderIndex` within a post; typed `IMAGE` or `VIDEO`. URLs are free-form today because the image pipeline is still external (see §6).

`Post.taggedProductIds` is a denormalised string array of Connect product ids. We accept the denormalisation — brands tag drops often; a join table would be heavier reads for no analytical win at Phase 4 scale. The composer validates that every tagged id belongs to the brand we publish as, so tagged ids can't cross brands.

`authorId` on `Post` is always a user id. A post published _as_ a brand additionally sets `brandId`; follow-as-brand and verified-brand badges compose from there. This keeps the follow graph single-sourced (users follow users) and defers "follow a brand directly" to a potential Phase 7 decision.

### 5. Feed queries are O(following) and avoid N+1 in the render path

`PostRepo.feedChronological(viewerId)` is defined as: posts whose `authorId` is either `viewerId` or in `following(viewerId)`, sorted by `createdAt desc`, paginated by a numeric cursor. The Prisma query is a single `IN (...)` on a column that already has an index on `(authorId, createdAt desc)` — planner picks an index merge, not a full scan. The cursor is a position into the sorted result for in-memory pagination; the Prisma implementation in Phase 5 migrates to a keyset cursor `(createdAt, id)` so it stays cheap past page ~3.

`PostRepo.feedForYou(viewerId)` is a scored variant: `score = followBoost + freshness`, decayed linearly over a week. It is deliberately a _stub_ gated by the `CW_FOR_YOU_RANKER` feature flag — the ranker contract is `(viewerId, params) → FeedPage`, which is enough for Phase 5 to drop in a real service behind the same interface without touching any page.

To avoid the classic feed N+1 (N posts × 4 signals each), every feed page composes signals in a single `Promise.all` batch per entry inside the route handler. The same helper (`post-card.tsx`) consumes pre-computed `likeCount`, `commentCount`, `isLiked`, and `isSaved`, so no component fetches during render. When the store gains a Prisma backend in Phase 5 we will collapse these into a single SQL round-trip using `groupBy` + a `LEFT JOIN` on the viewer's edges.

### 6. Image pipeline, moderation, and ranker boundaries

- **Images.** `PostMedia.url` is an opaque string today; we accept user-uploaded URLs on the composer only from a fixed allow-list of CDN hosts (to be added in Phase 5 alongside upload). The uploader will sit behind a Next.js route that talks to S3/R2 + a transformation worker; nothing in the render path needs to know. `<img>` tags are used rather than `next/image` until the CDN is pinned — swapping to `next/image` is cosmetic when the allow-list is locked down.
- **Moderation.** `PostRepo` and `CommentRepo` return raw records today. The Phase 9 moderation pipeline will wrap both with a `ModerationService` that can soft-hide (`hiddenAt != null`) without deleting; the repo interfaces do not need to change, only the Prisma-side query predicates. Report + appeal workflows land as a separate module.
- **Ranker.** Already contained in `PostRepo.feedForYou`; swapping the stub for a service call is one file.

### 7. Accessibility, keyboard paths, and SEO

- Post composer, comment form, and all interactive controls have `<label>`s, `required`/`maxLength` attributes, and `aria-pressed` on like/save toggles.
- Feed tabs use `aria-current="page"` and are plain links — no client JS required, keyboard focus works by default.
- Post detail pages set a `<title>` + `description` via `generateMetadata` using the first 140 characters of the post body (truncation at char-boundary; HTML-escaping by React is sufficient since we render server-side as text).
- Comment threading uses nested `<ul>`s with a visible left-border rail; depth is conveyed structurally, not only visually.

A full WCAG 2.1 AA pass remains scheduled for ARCH-GATE 4 (Phase 8).

### 8. Test coverage

Phase 3 adds:

- 10 `HttpConnectClient` tests (bearer headers, 404→null, URL encoding, error propagation, `healthCheck` modes, event fan-out).
- 11 webhook tests (signature + replay + malformed header + misconfigured secret + payload narrowing + delivery-log eviction).
- 3 factory tests (mock default, live selection, mock fallback on missing baseUrl).

Phase 4 adds 16 `WearStore` contract tests covering posts (create, media ordering, feed filtering/pagination, ranker stub), likes (idempotency, unknown post, activity order), comments (threading, bad parents, newest-first), and saves (default collection, unknown post, cross-owner rejection).

Combined, the project now runs **62 tests across 7 files** (Phase 1/2 baseline of 28 + 34 new). `istanbul` coverage reporting still lands with the Prisma implementation in Phase 5, when the store has enough branching logic for a gate to be meaningful.

## Consequences

**Positive**

- Live Connect rollout is a configuration change, not a code change: set `CONNECT_MODE=live` + `CONNECT_BASE_URL` + `CONNECT_API_KEY` and the rest of the app continues programming against the same contract.
- Webhook receiver is hardened on day one — forgeries, replays, and retries are all handled before any application code sees them.
- Feed surfaces exist and are rendered without N+1 at Phase 4 scale; the query plan is explicit and survives the swap to Prisma because the repo contract does not leak implementation.
- Composer gating guarantees a brand post can only be published by that brand's owner, and tagged drops can only come from that brand's catalog.
- Ranker, image pipeline, and moderation boundaries are explicit so Phase 5+ can slot them in without churning consumers.

**Negative / accepted**

- `MemoryDeliveryLog` is process-local, so horizontally-scaled deployments could still accept a replay across instances. Single-instance is the only supported topology through Phase 8; Phase 9 backs this with Redis before any multi-instance rollout.
- `Post.taggedProductIds` is denormalised; if a product is deleted in Connect, the tag becomes a dangling id. The render path treats unknown product ids as benign metadata; Phase 5's Connect webhook subscription cleans them up on `product.deleted`.
- `<img>` tags bypass `next/image` until the CDN allow-list is in place. Until then, the composer accepts no user-uploaded media — only seeded content renders images.
- The feed is chronological-first; the "For You" stub is not a ranking quality gate. Phase 5 is where we measure.

## Follow-ups

- **Phase 5:** Prisma-backed `WearStore` with keyset-cursor pagination on feed queries; collapse per-post signal batches into a single SQL round-trip. Land the real search surface. Wire Lighthouse + Playwright in CI once discovery pages exist. Enforce the ≥ 70 % coverage gate.
- **Phase 5:** CDN allow-list + uploader; swap `<img>` to `next/image`.
- **Phase 7:** Named save collections; mute/restrict edges; "follow a brand directly" decision.
- **Phase 9:** Redis-backed `DeliveryLog`; moderation pipeline (soft-hide + report/appeal workflow); horizontal scaling story.
