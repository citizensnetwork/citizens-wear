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

### Phase 2.5 — SE / poly hardening _(landed — April 2026)_

Post-ARCH-GATE 1 review applied:

- `pnpm` `overrides` force-patch `esbuild ≥ 0.25.0` (GHSA-67mh-4wv8-2f99); vitest bumped to 3.2.4 to pull in a patched vite 7.3.2 (GHSA-4w7w-66w2-5vf9). `pnpm audit` clean.
- `test:coverage` scripts added; v8 provider; thresholds enforced (`connect-client` 97%, `db` 100%, `web/lib` 100%).
- Defence-in-depth HTTP headers on every response (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS). CSP deferred to Phase 9.
- `outputFileTracingRoot` pins the workspace root so Next.js ignores stray `package-lock.json` files on dev machines.
- `.gitattributes` normalises line endings to LF.
- CodeQL scanning workflow (`.github/workflows/codeql.yml`) + Dependabot config (`.github/dependabot.yml`, grouped weekly PRs for npm and GitHub Actions).
- CI gained a final `pnpm audit --audit-level moderate` gate.

### Phase 3 — Real Citizens Connect wiring

- Replace `MockConnectClient` with HTTP/OIDC client (or keep mock + add webhook receiver if Connect is still unavailable).
- SSO parity across Wear and Connect.
- Idempotent, replay-safe webhook receiver.

### Phase 4 — Posts & the feed

- `Post`, `PostMedia`, `Like`, `Comment`, `CommentLike`, `SaveCollection`.
- Brand post composer with product tagging.
- Chronological feed; "For You" ranker stub behind a feature flag.
- Post detail, threaded comments, activity tab.

**🧭 ARCH-GATE 2** — ADR-0004. Feed query performance, N+1 audit, image pipeline, moderation hooks, Lighthouse ≥ 90, Playwright e2e green.

### Phase 5 — Discovery, search, brand catalog

- Explore page, search (users/brands/hashtags/products), brand "Shop" tab auto-populated from Connect.

### Phase 6 — Stories & DMs

- 24h stories, viewers, reactions, highlights.
- 1:1 and group DMs with message requests, typing/read receipts, block/report.
- Realtime layer finalised.

**🧭 ARCH-GATE 3** — ADR-0005. Realtime scalability, media retention, privacy controls, rate-limiting, encryption-at-rest, legal pages.

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
