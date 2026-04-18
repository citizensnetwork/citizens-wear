# Citizens Wear

> Christian clothing social platform — an extension of the [Citizens Connect](https://github.com/citizensnetwork/citizens-connect) ecosystem.
>
> **By the Kingdom. With the Kingdom. For the Kingdom.**

Citizens Wear brings Christian clothing brands, citizens, and communities together in an Instagram-style social experience, while Citizens Connect brings awareness of those brands out to the wider Kingdom. The two services share identity, profiles, and catalog data through a well-defined integration contract.

This repository is the Citizens Wear monorepo.

## Status

**Phase 1 — Foundations & Connect integration contract.**

See [`docs/rollout-plan.md`](docs/rollout-plan.md) for the full phased rollout and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the current architecture.

## Monorepo layout

```
apps/
  web/                  Next.js 14 App Router frontend + API routes
packages/
  ui/                   Design tokens (50/20/30 white/black/gold) and Tailwind preset
  connect-client/       Citizens Connect integration contract + MockConnectClient
  config/               Shared tsconfig + ESLint preset
docs/
  ARCHITECTURE.md
  rollout-plan.md
  architecture/decisions/ADR-*.md
```

## Prerequisites

- Node.js 20.11+ (see `.nvmrc`)
- pnpm 9.12+ (enable via `corepack enable`)

## Getting started

```bash
corepack enable
pnpm install
pnpm dev          # starts apps/web on http://localhost:3000
```

Useful scripts:

```bash
pnpm lint         # ESLint across all packages
pnpm typecheck    # tsc --noEmit across all packages
pnpm test         # Vitest across all packages
pnpm build        # Production build
pnpm format       # Prettier write
pnpm format:check # Prettier check (runs in CI)
```

## Key endpoints (Phase 1)

- `GET /` — Landing page wired to design tokens.
- `GET /health` — Liveness probe for the web service.
- `GET /api/connect/status` — Health-checks the Citizens Connect client (mock in Phase 1).

## Citizens Connect integration

Wear consumes Citizens Connect via a typed contract (`@citizens-wear/connect-client`). In Phase 1 it is backed by a `MockConnectClient` with deterministic fixtures so the app can be built, run, and tested in isolation. Phase 3 swaps the mock for a real HTTP/OIDC client without changes above the contract layer.

See [`docs/architecture/decisions/ADR-0002-connect-contract.md`](docs/architecture/decisions/ADR-0002-connect-contract.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

TBD — to be finalised before `v1.0.0` (Phase 9).
