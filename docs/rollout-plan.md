# Citizens Wear — Rollout plan

> Living document. Each phase ends green (CI, lint, typecheck, tests, build). Every two phases end with an **ARCH-GATE** review recorded in `architecture/decisions/`.

## Framing

- Instagram parity on the core social loop (feed, profile, follow, like, comment, DM, stories) — not a pixel clone.
- No proprietary assets. Citizens Wear's visual identity is its own: 50/20/30 white/black/gold, a crown mark, minimalist type.
- Citizens Connect is the source of truth for identity, brands, and products. Wear consumes it via `@citizens-wear/connect-client`.
- Tracking is personalization signals + product analytics only — no surveillance.

## Phases

### Phase 1 — Foundations & Connect integration contract _(this PR)_

- Monorepo (`apps/web`, `packages/ui`, `packages/connect-client`, `packages/config`) with pnpm + Turborepo.
- TypeScript strict, ESLint, Prettier, CI (lint, typecheck, test, build).
- Design tokens (50/20/30), Tailwind preset, `CrownMark` placeholder.
- `@citizens-wear/connect-client`: `AuthProvider`, `UserDirectory`, `BrandDirectory`, `ProductCatalog`, `EventBus` + `MockConnectClient` + fixtures + contract tests.
- Next.js landing page at `/`, `/health`, `/api/connect/status`.
- Docs: `README`, `CONTRIBUTING`, `ARCHITECTURE.md`, ADR-0001, ADR-0002, this plan.

### Phase 2 — Identity, profiles, follow graph _(landed — ADR-0003)_

- `@citizens-wear/db` with `prisma/schema.prisma` (User, Brand, Profile, Follow, UserSettings) and an in-memory `WearStore` contract + tests.
- Cookie-backed session bridged to the Connect `AuthProvider` (Auth.js-shaped; mock token today, OIDC in Phase 3).
- Profile pages: `/u/[handle]` (user, follow/unfollow, public/private, verified badge) and `/b/[slug]` (brand, verified, drops list).
- `/settings` skeleton (display-name override, bio, profile visibility, account kind).
- Server actions for follow/unfollow that re-authenticate on every call.

**🧭 ARCH-GATE 1** — ADR-0003. Review data model, auth boundaries, Connect contract sufficiency, token system, a11y baseline, test coverage ≥70%.

### Phase 3 — Real Citizens Connect wiring _(landed — ADR-0004)_

- `HttpConnectClient` implements the `ConnectClient` contract against a live HTTP service; `createConnectClient()` factory selects mock vs. live from `CONNECT_MODE` / `CONNECT_BASE_URL` / `CONNECT_API_KEY`.
- SSO parity: Auth.js-shaped `/api/auth/callback/connect` route completes a Connect-issued token into the Wear session cookie; `/sign-in` mock form remains for local dev.
- Idempotent, replay-safe webhook receiver at `/api/connect/webhook` (HMAC-SHA256 signature, ≤5-min skew, `x-connect-delivery-id` dedupe) that fans into `ConnectClient.events`.

### Phase 4 — Posts & the feed _(landed — ADR-0004)_

- `@citizens-wear/db` extended with `Post`, `PostMedia`, `Like`, `Comment`, `CommentLike`, `SaveCollection`, `SavedPost` (schema + TS contract + memory impl + contract tests).
- `/compose` brand post composer with opt-in "publish as brand" and product tagging scoped to that brand.
- `/feed` chronological feed; "For You" ranker stub behind the `CW_FOR_YOU_RANKER` feature flag (freshness + follow boost).
- `/p/[id]` post detail with threaded comments, comment likes, saves.
- `/u/[handle]/activity` activity tab aggregating posts, likes, comments, and saves.

**🧭 ARCH-GATE 2** — ADR-0004 (this repo). Feed query plan, N+1 audit, image pipeline, moderation hooks, Connect live/mock parity, webhook contract. Lighthouse ≥ 90 and Playwright e2e land with Phase 5 when the discovery surfaces give them a meaningful baseline to measure against.

### Phase 5 — Discovery, search, brand catalog _(landed — ADR-0005)_

- Connect contract gains `BrandDirectory.search` and `ProductCatalog.search`; `MockConnectClient` and `HttpConnectClient` both implement, with contract tests for each.
- `@citizens-wear/db` extends `PostRepo` with `searchByText`, `listByHashtag`, and `trendingHashtags`, plus a shared Unicode-aware `extractHashtags` / `normaliseHashtag` helper module.
- `/explore` discovery hub (trending hashtags, featured brands, suggested citizens, fresh drops, from-the-feed strip).
- `/search?q=…&kind=…` unified search across citizens / brands / hashtags / posts / drops; query length capped, `kind` validated as a closed enum.
- `/h/[tag]` hashtag feed; `PostCard` linkifies hashtags with React-escaped text segments (XSS-safe).
- Brand profile gains Drops + Posts tabs; product descriptions surfaced.
- `PageShell` adds Explore link + header search box that works without JavaScript.

### Phase 6 — Stories & DMs _(landed — ADR-0006)_

- 24h ephemeral stories with views, five-emoji reactions, and per-author highlights; followers-only audience supported. Stories tray on `/feed`, viewer at `/stories/[id]`, composer at `/compose/story`.
- 1:1 and group conversations with message requests for non-mutuals, soft-delete of own messages, mark-read, accept/decline. Inbox at `/messages`, thread at `/messages/[id]`, new-DM at `/messages/new`.
- Block (symmetric, also unfollows) and report (open subjects: post, comment, message, story, user). Block surfaced on profile pages.
- `RealtimeBus` interface seam in `@citizens-wear/db` with an in-process `MemoryRealtimeBus` adapter; server actions publish typed events that a Phase 9 broker can fan out across nodes without changing call sites.

**🧭 ARCH-GATE 3** — ADR-0006 (this repo). Realtime scalability seam, message-request flow, story retention/expiry, block-symmetry guarantees, report queue shape.

### Phase 7 — Notifications, saves, settings depth

- Web push + email + in-app; saved collections, archive, Inner Circle, mute, restrict; full settings.

### Phase 8 — Brand tooling & Kingdom features

- Brand insights dashboard.
- Brand-to-brand collaborations.
- Global Kingdom Updates surface.
- Public Events module (RSVP, event feed).
- Opt-in Scripture-of-the-day.

**🧭 ARCH-GATE 4** — ADR-0006. Security review, authz matrix, IDOR audit, perf budget, backup/restore drill, WCAG 2.1 AA audit.

### Phase 9 — Hardening & launch

- Sentry, structured logging, SLOs, uptime.
- Load tests for feed/stories/DMs.
- Moderation tooling (reports, NSFW/abuse detection, appeals).
- Terms, Privacy, Community Guidelines (Kingdom-values), DMCA.
- `v1.0.0` tag and release notes.

## Delivery rules

1. Each phase lands via PR; `main` is protected.
2. A phase is not "done" until CI is green.
3. ARCH-GATE PRs must update the matching ADR; non-gate PRs may reference ADRs but must not silently change architecture.
4. If Citizens Connect's real shape diverges from the contract, update the contract and regenerate tests **before** touching consumers.
