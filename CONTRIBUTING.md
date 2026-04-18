# Contributing to Citizens Wear

Thanks for helping build Citizens Wear — a Christian clothing social platform _by, with, and for the Kingdom._

## Ground rules

1. **Every change ends green.** A PR is not mergeable until `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all succeed locally _and_ in CI.
2. **Small, reviewable PRs.** Phased work is tracked in [`docs/rollout-plan.md`](docs/rollout-plan.md). Keep PRs inside one phase where possible.
3. **Don't clone proprietary assets.** We borrow Instagram-style _interaction patterns_, not Instagram's icons, copy, or brand. Everything visible should reinforce Citizens Wear.
4. **Honor the Connect contract.** Cross-service data (users, brands, products) flows through `@citizens-wear/connect-client`. Don't reach around it.

## Setup

```bash
corepack enable
pnpm install
```

## Common scripts

| Script              | What it does                           |
| ------------------- | -------------------------------------- |
| `pnpm dev`          | Run the web app in dev mode            |
| `pnpm lint`         | Run ESLint across the monorepo         |
| `pnpm typecheck`    | Run `tsc --noEmit` across the monorepo |
| `pnpm test`         | Run Vitest across the monorepo         |
| `pnpm build`        | Production build (all packages)        |
| `pnpm format`       | Prettier write                         |
| `pnpm format:check` | Prettier check (runs in CI)            |

## Architectural checks

The rollout plan specifies an **ARCH-GATE** after every two phases. Before opening a PR that closes a phase, open the associated ADR under `docs/architecture/decisions/` and fill it in with the review findings. A phase is not complete without its gate, when applicable.

## Branching

- `main` is protected. All work lands via PR.
- Use descriptive branch names, e.g. `phase-2/profiles-follow-graph`.

## Commits

Plain, present-tense, imperative messages (`Add profile page`, not `Added profile page`). No emoji prefixes required.
