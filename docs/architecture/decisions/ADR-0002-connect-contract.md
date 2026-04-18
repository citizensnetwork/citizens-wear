# ADR-0002 — Citizens Connect integration contract

- **Status:** Accepted (Phase 1)
- **Date:** 2026-04-18
- **Deciders:** Citizens Network / Citizens Wear maintainers

## Context

Citizens Wear does not own identity, brands, or product catalog — Citizens Connect does. Wear must:

1. let citizens sign in on either side and land with the same identity on the other,
2. reflect brand profile and stock updates from Connect in near real time,
3. be buildable and testable **before** the Connect HTTP surface is stable.

At the time of Phase 1, the `citizensnetwork/citizens-connect` repository is not accessible from Wear's build environment. Blocking on Connect to begin Wear is not acceptable.

## Decision

We define a **TypeScript contract** (`@citizens-wear/connect-client`) that declares the capability surface Wear expects from Connect:

- `AuthProvider` — `verifyToken(token)`, `getCurrentUser(session)`.
- `UserDirectory` — `getById`, `getByHandle`, `search`.
- `BrandDirectory` — `getById`, `getBySlug`, `listAll`, `listForOwner`.
- `ProductCatalog` — `getById`, `listForBrand`.
- `EventBus` — `subscribe`, `publish` (webhook-fed in Phase 3).

Wear ships a `MockConnectClient` that satisfies the contract using in-memory fixtures. All application code depends on the interface, never on the mock directly. Contract tests in `packages/connect-client/test/` are written against the interface and must also pass against the real HTTP client when it lands.

### Invariants

- All IDs are opaque strings issued by Connect; Wear never invents them.
- All results are read-only, paginated snapshots.
- All errors are `ConnectError` with a stable `code` and optional HTTP `status`.
- All methods are async.

### Modes

- **`mode: "mock"`** — Phase 1 and local dev. Used by `MockConnectClient`.
- **`mode: "live"`** — Phase 3+. HTTP/OIDC client against a real Connect deployment.

`/api/connect/status` surfaces the active mode for debugging.

## Consequences

**Positive**

- Wear can be built, tested, and demoed without any Connect dependency.
- Phase 3 is a drop-in replacement: everything above the contract is unaffected.
- Contract tests catch drift between mock and live implementations.

**Negative**

- We could diverge from Connect's real shape if we don't sync early and often.
  → Mitigation: review the contract jointly with the Connect team at ARCH-GATE 1 and 2.

## Out of scope for Phase 1

- Real OIDC flow, token refresh, revocation.
- Webhook receiver, signature verification, replay protection (Phase 3).
- Write endpoints (Wear mutating Connect data) — not anticipated; if needed, a separate ADR.
