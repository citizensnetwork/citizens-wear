# ADR-0003 — ARCH-GATE 1: identity, profiles, follow graph

- **Status:** Accepted (Phase 2 / ARCH-GATE 1)
- **Date:** 2026-04-18
- **Deciders:** Citizens Network / Citizens Wear maintainers
- **Supersedes:** none
- **Superseded by:** none

## Context

Phase 2 of the Citizens Wear rollout (`docs/rollout-plan.md`) lands identity, profile pages, the follow graph, and a settings skeleton. This ADR records the ARCH-GATE 1 review that the rollout plan schedules at the end of Phase 2.

Phase 1 established:

- The `@citizens-wear/connect-client` contract, with `MockConnectClient` backing every caller until the real Connect HTTP/OIDC surface is available (ADR-0002).
- Design tokens, a Tailwind preset, and a crown mark.
- Baseline CI: `format:check`, lint, typecheck, tests, build.

Phase 2 must answer:

1. Where does Wear-owned data live, and in what shape?
2. How does Wear authenticate a citizen today, and how does that path survive the switch to the real Connect in Phase 3?
3. Is the Connect contract sufficient for Phase 2, or does it need to grow?
4. What is the accessibility and test-coverage baseline we carry into Phase 3?

## Decision

### 1. Data model

A new package, `@citizens-wear/db`, owns:

- `prisma/schema.prisma` — the Prisma data model. It is the human source of truth for Wear-owned storage and will back the first real migration when Phase 3 provisions a database. It is **not** yet wired to a running Prisma client; we avoid adding Prisma as a runtime dependency until we have a database to point it at.
- `src/contract.ts` — a TypeScript repository contract (`ProfileRepo`, `FollowRepo`, `SettingsRepo`, `WearStore`) that mirrors the schema one-for-one. All callers program against this contract.
- `src/memory.ts` — `MemoryWearStore`, an in-memory implementation of `WearStore` used by the app runtime and by contract tests.

Ownership split:

- **Connect owns:** `User`, `Brand` identities and metadata. Wear never invents a `ConnectId`.
- **Wear owns:** `Profile` (bio, visibility, Wear-side verified flag), `Follow`, `UserSettings`. These have no counterpart in Connect and would otherwise couple the two services unnecessarily.

`Follow` uses a composite primary key `(actorId, targetId)` with an index on `targetId` (follower lookups dominate). Self-follow is rejected at the application layer in both `MemoryWearStore` and the follow server actions; the DB schema will re-assert it with a `CHECK` when it lands.

### 2. Authentication

Wear authenticates via a cookie-backed session bridged to the Connect `AuthProvider`:

- `cw_session` is an `HttpOnly`, `SameSite=Lax`, `Secure`-in-prod cookie whose value is an opaque Connect-issued token.
- Every session read goes through `apps/web/src/lib/session.ts :: getSession()`, which hands the token to `ConnectClient.auth.verifyToken` and resolves the user via `getCurrentUser`. Wear never parses the token itself.
- The sign-in surface today is a mock token form (`/sign-in`) — deliberately minimal so that Phase 3 can replace it with an Auth.js / NextAuth-managed OIDC redirect without touching any consumer.
- Server actions (`followUser`, `unfollowUser`, `updateSettingsAction`) re-authenticate on every call and redirect unauthenticated callers to `/sign-in`.

Rationale for _not_ adopting NextAuth / Auth.js this phase: the real Connect OIDC discovery URL is not yet stable, and Auth.js configuration (providers, callbacks, JWT vs. DB sessions) is best authored against a real issuer. The session surface in `lib/session.ts` is intentionally shaped to slot under Auth.js later.

### 3. Connect contract sufficiency

The existing contract already exposes everything Phase 2 needs: `AuthProvider.verifyToken` / `getCurrentUser`, `UserDirectory.getByHandle`, `BrandDirectory.getBySlug` / `listForOwner`, and `ProductCatalog.listForBrand`. No new capabilities were added to `@citizens-wear/connect-client` in Phase 2; ADR-0002 stands unamended.

Wear does **not** extend the Connect contract with profile/visibility/follow concepts — those are Wear-owned and stay in `@citizens-wear/db`.

### 4. Accessibility baseline

- Every form control on `/sign-in` and `/settings` has an associated `<label>` and, where useful, an `aria-describedby` helper.
- The verified badge and brand check-mark use `aria-label` / `title` for assistive technologies; colour is not the sole carrier of meaning (the `✓` glyph carries the signal).
- Page chrome (`PageShell`) uses semantic `<header>`, `<nav>`, `<main>`, `<footer>`.
- We carry the existing Tailwind colour contrast targets from the `50/20/30` palette; no new colour combinations that would regress contrast were introduced.

A full WCAG 2.1 AA audit is deferred to ARCH-GATE 4 (Phase 8) per the rollout plan.

### 5. Test coverage

Phase 2 adds:

- 11 contract tests in `packages/db/test/contract.test.ts` covering profiles, follows, settings, and seeding.
- A web-layer test in `apps/web/src/lib/store.test.ts` asserting the singleton and seed invariants.

Combined with Phase 1 tests, the project now has 28 passing tests across three packages. Coverage tooling is not yet wired; `istanbul` integration and an explicit ≥70 % gate land alongside the first real Prisma repository in Phase 3, when the store has meaningful branching logic to cover.

## Consequences

**Positive**

- Wear can render profile pages, accept follow/unfollow, and persist settings end-to-end today, with zero live infrastructure.
- The `WearStore` contract isolates the storage swap. Moving from `MemoryWearStore` to a Prisma-backed store in Phase 3 requires no changes in route handlers, server actions, or pages.
- The session module is a single, small surface area. Replacing mock token verification with real OIDC verification is a one-file change.
- `prisma/schema.prisma` is reviewable now, well before the DB is provisioned; data-model mistakes are cheaper to fix here than after the first migration.

**Negative / accepted**

- Data is not persistent across server restarts. This is acceptable for a Phase 2 demo environment and is explicitly the boundary ARCH-GATE 1 commits to crossing in Phase 3.
- Multi-instance deployments would see divergent state — we do not deploy multi-instance until after Phase 3.
- We accept the short-term duplication between `prisma/schema.prisma` and `src/contract.ts`; they are co-located in one package and review will catch drift. Phase 3 collapses them by generating the TypeScript types from Prisma.

## Follow-ups

- **Phase 3:** wire a Postgres database, run the initial Prisma migration from `prisma/schema.prisma`, replace `MemoryWearStore` with a Prisma implementation, and swap the mock sign-in form for a Connect OIDC redirect.
- **Phase 3:** wire coverage reporting and enforce the ≥ 70 % gate promised in the rollout plan.
- **Phase 4:** when posts land, extend the follow graph with block/mute edges before exposing DMs; track as part of ADR-0004.
