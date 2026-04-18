# ADR-0001 — Tech stack for Citizens Wear

- **Status:** Accepted (Phase 1)
- **Date:** 2026-04-18
- **Deciders:** Citizens Network / Citizens Wear maintainers

## Context

Citizens Wear is a new greenfield service in the Citizens Network ecosystem. It must:

- extend Citizens Connect (identity, brands, products) rather than duplicate it,
- support Instagram-style social interaction patterns (feed, profile, follow, like, comment, DM, stories),
- be buildable by a small team on a tight budget (Vercel + Supabase preferred when affordable),
- be friendly to a future mobile surface (React Native) with shared business logic.

## Decision

We adopt the following stack:

| Concern    | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Monorepo   | pnpm workspaces + Turborepo                                       |
| Web app    | Next.js 14 (App Router) + TypeScript strict + React 18            |
| Styling    | Tailwind CSS with a shared design-token preset                    |
| API        | Next.js route handlers now; tRPC when typed RPC is worth it       |
| Database   | PostgreSQL via Prisma                                             |
| DB hosting | Supabase when budget permits; any managed Postgres otherwise      |
| Auth       | Auth.js (NextAuth) with a Citizens Connect OIDC adapter (Phase 3) |
| Media      | S3-compatible object store (decision deferred to Phase 4)         |
| Testing    | Vitest, Testing Library, Playwright (Phase 4+)                    |
| Quality    | ESLint, Prettier, TypeScript strict, `noUncheckedIndexedAccess`   |
| Hosting    | Vercel                                                            |
| CI/CD      | GitHub Actions — lint, typecheck, test, build                     |

## Consequences

**Positive**

- Entire stack is TypeScript end-to-end; types flow from Connect contract to UI.
- Boring, well-documented tools — easy to onboard contributors.
- Turborepo gives us caching and parallelism without heavy ops.
- Vercel + Supabase is the cheapest viable path to production for a small team.

**Negative / trade-offs**

- Vercel lock-in for some features (edge functions, image optimization). Acceptable for Phase 1–9; revisit before scale.
- Prisma has a non-trivial bundle impact on serverless; we'll monitor cold starts.
- Next.js App Router is still maturing; we accept some churn in exchange for server components.

## Alternatives considered

- **Remix / Astro** — rejected for weaker RSC/server-mutation story at our scale.
- **NestJS + separate React SPA** — rejected as heavier for a team this size.
- **Firebase / Supabase Auth instead of Connect** — rejected; identity must originate in Citizens Connect.

## Revisit

At ARCH-GATE 2 (after Phase 4) we'll reassess: serverless bundle size, cold-start latency, and whether tRPC is pulling its weight.
