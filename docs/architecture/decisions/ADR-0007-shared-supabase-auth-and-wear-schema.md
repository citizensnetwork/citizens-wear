# ADR-0007 — Shared Supabase Auth and a `wear.*` schema (Connect integration, reconciled)

- **Status:** Accepted (Phase 3 direction) — scope only; implementation deferred
- **Date:** 2026-06-21
- **Deciders:** Citizens Network founder + Citizens Wear maintainers
- **Supersedes:** none
- **Amends:** ADR-0002 (Citizens Connect integration contract)

## Context

ADR-0002 (Phase 1) defined `@citizens-wear/connect-client` as the capability
surface Wear expects from Citizens Connect — `AuthProvider` (token verify),
`UserDirectory`, `BrandDirectory`, `ProductCatalog`, `EventBus` — and shipped a
`MockConnectClient` so Wear could be built before Connect's surface stabilised.
It explicitly warned: *"We could diverge from Connect's real shape if we don't
sync early and often."*

That sync is now overdue, and the divergence is real. Verified against the live
`citizens-connect` repo (2026-06-21):

- Connect's real cross-app surface is **`/api/v1/{events, events/[id], places,
  contributors, contributors/[slug], contributors/[slug]/stats, categories,
  analytics/community}`** — a map-discovery domain.
- Wear's `HttpConnectClient` targets **`/v1/auth/verify`, `/v1/auth/me`,
  `/v1/users/*`, `/v1/brands/*`, `/v1/products/*`, `/v1/health`** — an
  identity + clothing-catalog domain.
- These are **disjoint**: different path prefix (`/v1` vs `/api/v1`) *and*
  different resources. Connect has **no** brands, products, citizen-user
  endpoint, OIDC issuer, or token-verify endpoint. Connect auth is **Supabase
  Google OAuth**.

Separately, the ecosystem has since made a foundational decision
(`citizens-connect/docs/strategy/ECOSYSTEM_DECISION_BRIEF.md`, **D1**, 2026-06-16):
**one shared Supabase project, one `auth.users`, a schema per app** (`public`/
commons, `vision.*`, and a future `wear.*`). Citizens Vision was cut onto this
model in June 2026. Wear's `LOCAL-SETUP.md` still assumes a *separate* Wear
Supabase project and a Connect *OIDC* issuer — both predate and contradict D1.

So "wire Connect for real" (the Phase-3 promise of ADR-0002 and ADR-0004) cannot
mean "flip `CONNECT_MODE=live`": the endpoints Wear's client calls do not exist.
It needs a direction decision. This ADR records it.

## Decision

### 1. Identity comes from the shared Supabase Auth, not a Connect OIDC bridge

Wear authenticates **directly against the shared Citizens Supabase project**
(`xyiajtrvhlxaeplsiajj`), using its `auth.users` and Google OAuth — the same
identity plane Connect and Vision use. There is **one Kingdom identity**: a
citizen who signs in on Connect is the same `auth.users` row in Wear.

This replaces:
- the `cw_session` opaque-token cookie verified via `connect-client.auth`
  (`apps/web/src/lib/session.ts`, `MOCK_SIGN_IN_TOKEN`), and
- the never-built Connect **OIDC** flow assumed by `LOCAL-SETUP.md`.

`getSession()` / `getCurrentUser()` stay as the only session entry points, but
resolve a Supabase user (via `@supabase/ssr`) plus the shared `public.profiles`
row, rather than a mock token.

### 2. Wear owns its commerce/social data in a `wear.*` schema

The `packages/db/prisma/schema.prisma` shape (`Brand`, `Product`-equivalents,
`Post`, `Follow`, `Story`, `Conversation`, `Message`, `Block`, `Report`, …)
lands as **`wear.*` tables in the shared project**, RLS-walled (owner-scoped
writes; public reads where appropriate). This activates the third schema
boundary the shared-DB contract reserved (`public`/commons, `vision.*`,
**`wear.*`**). Migrations are authored in the **`citizens-connect` migration
lineage** (the single source of truth for the shared project; next # = 143),
not in a separate Wear migration set.

`packages/db` moves off `MemoryWearStore` onto the real client for runtime;
`MemoryWearStore` and the contract tests remain the test substrate.

### 3. `connect-client` is reconciled to what Connect actually owns

Wear stops expecting users/brands/products/OIDC from Connect. The residual,
genuine cross-app need is reading the wider Kingdom footprint — Connect
**contributors** and **categories** — over the **real `/api/v1`** (per the
shared-DB contract, cross-app reads go through `/api/v1`, never raw tables).
`MockConnectClient` is retained for tests. Whether a Wear "brand" links to a
Connect contributor (shared org identity) is an open question (see below); the
brand/product/user *catalog* itself is **Wear-owned** in `wear.*`.

### 4. This is recorded now; built later

This ADR is the **direction**, decided so a cold session does not re-litigate it.
The implementation is a multi-step build on a branch off `main`, sequenced in
`citizens-connect/docs/strategy/STEP3_WEAR_INTEGRATION_SCOPE.md` §3. No
functional code changes ship with this ADR.

## Consequences

**Positive**

- One `auth.users` across Connect, Vision, and Wear — the literal "Connecting
  the Kingdom" payoff: a citizen known in one channel is known in all.
- Unblocks Wear without waiting on Connect to grow a commerce/OIDC API it has
  no domain for. Wear has **no prod data**, so there is still zero data
  migration — the cost is build, not migration.
- Honours D1 (schema-per-app) and the shared-DB contract's RLS-only-wall;
  `wear.*` keeps a later physical split cheap.
- Ends the silent ADR-0002 drift with an explicit, recorded reconciliation.

**Negative / accepted**

- A real build, not a config flip: add `@supabase/*`, rewrite the session layer,
  author the `wear.*` migration + RLS, and refactor `connect-client`. Multi-step.
- Wear's `LOCAL-SETUP.md` env blueprint (separate Wear Supabase project, Connect
  OIDC keys) must be rewritten to the shared-project model.
- The mock-token sign-in path and parts of the `connect-client` brand/product/
  user surface are removed or repurposed; contract tests change accordingly.

**Out of scope (this ADR)**

- Choosing Prisma (pooled `DATABASE_URL`) vs PostgREST (`wear` in Exposed
  schemas) for Wear's reads — decided at build time.
- The exact citizen-identity read path (Supabase Auth claims vs RLS read of
  `public.profiles` vs a new `/api/v1` profiles endpoint; Connect exposes
  contributors, not plain citizen profiles, today).
- Whether Wear brands link to Connect contributors.
- The `wear.*` table DDL and RLS policies themselves (authored in the Connect
  migration lineage during the build).

## References

- `citizens-connect/docs/strategy/STEP3_WEAR_INTEGRATION_SCOPE.md` — the full
  scope, verified-reality findings, build sequence, and open questions.
- `citizens-connect/docs/strategy/ECOSYSTEM_DECISION_BRIEF.md` — D1/D2/D5.
- `citizens-connect/docs/SHARED_DB_CONTRACT.md` — schema boundaries, RLS wall, R2/R4.
- `citizens-connect/docs/api-v1.md` — the real cross-app contract surface.
- ADR-0002 (the contract this amends) and ADR-0004 (Connect wiring, posts/feed).
