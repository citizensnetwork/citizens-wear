# Citizens Wear Project Status

## Current Batch: Social-Commerce Foundation

Status: validated locally, ready to ship.

Implemented:

- Added [docs/social-commerce-vertical-slice.md](../docs/social-commerce-vertical-slice.md) to preserve the first-slice product, role, UX, and architectural guardrails.
- Extended `@citizens-wear/db` with Wear-owned social-commerce contracts: posts, media references, Connect product tags, likes, saves, comments, cart intent, brand follows, and moderation.
- Mirrored the social-commerce model in [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma), keeping Connect ids as references and preserving brand-post invariants.
- Implemented deterministic in-memory repositories in [packages/db/src/memory.ts](../packages/db/src/memory.ts).
- Expanded DB contract coverage to 27 tests in [packages/db/test/contract.test.ts](../packages/db/test/contract.test.ts).
- Remediated the PostCSS audit finding by pinning PostCSS to `8.5.10` and refreshing [pnpm-lock.yaml](../pnpm-lock.yaml).
- Updated [apps/web/next.config.js](../apps/web/next.config.js) to use top-level `typedRoutes` for Next 15.

## Latest Validation

Run from workspace root on Windows PowerShell.

- `pnpm exec prettier --check docs/social-commerce-vertical-slice.md packages/db/src/contract.ts packages/db/src/memory.ts packages/db/test/contract.test.ts package.json apps/web/package.json apps/web/next.config.js pnpm-lock.yaml`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed. `@citizens-wear/connect-client` 14 tests, `@citizens-wear/db` 27 tests, `@citizens-wear/web` 2 tests.
- `pnpm lint`: passed. Next.js `next lint` deprecation notice only.
- `pnpm build`: passed. Node `url.parse()` deprecation warning only.
- `pnpm audit --audit-level moderate`: passed. No known vulnerabilities found.
- Changed-file secret scan: passed. No matches for common secret/private-key patterns.
- Supabase security advisors: reachable; existing linked-project baseline has 53 warnings. This slice did not apply Supabase migrations or add new Supabase DDL. Baseline groups:
  - `anon_security_definer_function_executable`: 20 warnings. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable>
  - `authenticated_security_definer_function_executable`: 20 warnings. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable>
  - `function_search_path_mutable`: 6 warnings. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable>
  - `materialized_view_in_api`: 5 warnings. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0016_materialized_view_in_api>
  - `extension_in_public`: 1 warning. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public>
  - `auth_leaked_password_protection`: 1 warning. Remediation: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>

## Review Gates

- Architecture review: passed after fixing post visibility/status filtering, author kind invariants, Prisma brand relation behavior, and moderation auditability.
- Security/vibe review: passed after replacing public restricted-list bypass with branded trusted access, enforcing cart item ownership on update/remove, and requiring readable published posts for likes/saves/comments.

## Known Non-Blocking Warnings

- Full-repo `pnpm format:check` is not currently a clean gate because legacy/reference files have pre-existing formatting drift. Changed files from this batch are Prettier-clean.
- Next 15 still emits the `next lint` deprecation notice.
- Build emits a Node `url.parse()` deprecation warning from the toolchain path.
