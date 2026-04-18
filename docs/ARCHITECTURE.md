# Citizens Wear — Architecture

> Status: **Phase 1 — Foundations & Connect integration contract**

This document is a living snapshot of how Citizens Wear is put together. It is updated at the end of each phase and audited at each ARCH-GATE.

## 1. Why Citizens Wear exists

Citizens Wear is the Instagram-style social surface of the Citizens Network ecosystem, focused on Christian clothing brands, citizens, and communities. Its sibling, **Citizens Connect**, broadcasts brand awareness outward to the Kingdom; **Citizens Wear** brings the Kingdom to meet those brands and follow, interact, and purchase.

The two services share identity, profiles, and catalog data. Wear is a _consumer_ of Connect, not a fork.

## 2. Guardrails

These are non-negotiable and inform every design decision:

- **No cloning of Instagram proprietary assets.** Interaction patterns only.
- **Single source of truth for identity and catalog is Citizens Connect.** Wear mirrors; it does not originate user, brand, or product records.
- **Tracking is personalization signals + product analytics only.** No surveillance-style telemetry.
- **Every phase ends green** (CI, lint, typecheck, tests, build).
- **Architectural review every two phases** — see [`architecture/decisions/`](architecture/decisions/).

## 3. High-level topology

```
┌──────────────────────┐                 ┌──────────────────────┐
│  Citizens Connect    │  OIDC/HTTP      │  Citizens Wear (web) │
│  (identity, brands,  │◀───────────────▶│  Next.js App Router  │
│   products, events)  │  webhooks       │                      │
└──────────────────────┘                 └──────────┬───────────┘
                                                    │
                                                    │ Prisma
                                                    ▼
                                           ┌──────────────────┐
                                           │  PostgreSQL      │
                                           │  (Supabase-hosted│
                                           │   when budget    │
                                           │   allows)        │
                                           └──────────────────┘
```

In Phase 1 the Connect side is mocked in-process by `MockConnectClient`. Phase 3 swaps in the real HTTP/OIDC client without changes above the contract boundary.

## 4. Tech stack (locked in)

| Concern  | Choice                                                            |
| -------- | ----------------------------------------------------------------- |
| Monorepo | pnpm workspaces + Turborepo                                       |
| Web app  | Next.js 14 (App Router) + TypeScript + React 18                   |
| Styling  | Tailwind CSS with the `@citizens-wear/ui` design-token preset     |
| API      | Next.js route handlers (tRPC added when we need typed RPC)        |
| DB       | PostgreSQL via Prisma (Supabase-hosted when budget allows)        |
| Auth     | Auth.js with a Citizens Connect OIDC adapter (Phase 3)            |
| Media    | S3-compatible object store (Phase 4)                              |
| Realtime | Decision deferred to ARCH-GATE 2                                  |
| Testing  | Vitest + Testing Library + Playwright (added in Phase 4)          |
| Quality  | ESLint, Prettier, TypeScript `strict`, `noUncheckedIndexedAccess` |
| CI/CD    | GitHub Actions; deploy target Vercel                              |

See [`architecture/decisions/ADR-0001-stack.md`](architecture/decisions/ADR-0001-stack.md).

## 5. Repository layout

```
apps/
  web/                  Next.js app (UI, route handlers, API)
packages/
  ui/                   Design tokens, Tailwind preset, CrownMark
  connect-client/       Citizens Connect contract + MockConnectClient + fixtures + contract tests
  config/               Shared tsconfig + ESLint preset
docs/
  ARCHITECTURE.md       (this file)
  rollout-plan.md       Phased delivery plan
  architecture/decisions/ADR-*.md
```

Shared packages are consumed from source via Next's `transpilePackages`, so no pre-build step is needed during development.

## 6. Citizens Connect contract

All cross-service reads and writes flow through `@citizens-wear/connect-client`. The contract surfaces are:

- `AuthProvider` — verify tokens, resolve sessions.
- `UserDirectory` — read-through user lookup/search.
- `BrandDirectory` — read-through brand lookup/listing.
- `ProductCatalog` — read-through product/stock lookup.
- `EventBus` — inbound Connect events (webhooks in Phase 3).

All results are paginated, immutable snapshots. All errors are `ConnectError` instances with a stable `code`.

See [`architecture/decisions/ADR-0002-connect-contract.md`](architecture/decisions/ADR-0002-connect-contract.md).

## 7. Design system

Primary palette ratio target **50% white / 20% black / 30% gold**.

| Role       | Token          | Hex       |
| ---------- | -------------- | --------- |
| Paper      | `paper`        | `#FBFAF7` |
| Paper soft | `paper-soft`   | `#F3F1EC` |
| Ink        | `ink`          | `#0B0B0B` |
| Ink soft   | `ink-soft`     | `#4A4A4A` |
| Gold       | `gold.DEFAULT` | `#C9A24A` |
| Gold deep  | `gold.deep`    | `#A88535` |
| Gold muted | `gold.muted`   | `#F2E7C9` |
| Border     | `border`       | `#E5E2DA` |

Iconography is line-based, 1.5 stroke, rounded corners. The brand mark is the **crown** (`CrownMark`) — currently a placeholder — rendered in gold.

## 8. Observability, privacy, behaviour tracking

_Scope_ of tracking is limited to:

- **Product analytics** — page views, feature usage, conversion funnels, aggregated.
- **Personalization signals** — follows, likes, saves, dwell on own feed, opt-in.
- **Operational telemetry** — logs, error tracking, performance.

Explicitly **out of scope**: keystroke capture, cross-site tracking, off-platform ad targeting, dark-pattern engagement loops.

Instrumentation is added in Phase 9.

## 9. Open questions / deferred decisions

- Realtime layer (Postgres LISTEN/NOTIFY vs Ably/Pusher) — ARCH-GATE 2.
- Search backend migration (Postgres FTS → Meilisearch) — Phase 5.
- Moderation pipeline vendor — Phase 9.
- Final license — Phase 9.
