# Citizens Wear Project Status

## Current Batch: Branch Reconciliation + Vision Capture (May 2026)

Status: validated locally, pushed to `origin/chore/phase-2-se-poly-hardening`.

Implemented:

- **Branch reconciliation** — see [`.github/DECISIONS.md`](DECISIONS.md#branch-reconciliation--phase-4-local-rewrite-vs-canonical-lineage-may-2026). Local Phase-4 rewrite preserved on `origin/chore/phase-4-local-rewrite` @ `05d6407`; canonical `origin/chore/phase-2-se-poly-hardening` (Phases 3–6) wins as trunk for the merge to `main`.
- **Security cherry-pick audit.** Of the 7 hardening items from `05d6407`, items 1–3 (brand-ownership, citizen-tag drop, http(s)-only media) were already present in canonical or implicit; items 4–6 (cart returnPath allowlist, `resolveModeration` Forbidden throw, `?as=admin` env-gate) are **not applicable** because cart, admin moderation page, and admin sign-in preset are not in canonical and will be re-introduced as deliberate Phase 7/8 work.
- **`safeUrl` extracted** from `apps/web/src/lib/actions.ts` to a new `apps/web/src/lib/validators.ts` with **10 unit tests** in `validators.test.ts` (rejects `javascript:` / `data:` / `file:` / `vbscript:`, rejects URLs with embedded credentials, accepts http+https, canonicalises). Added the credential-rejection guard the inline version was missing.
- **Durable vision/idea/roadmap docs** authored so context survives conversation deletion:
  - [`docs/VISION.md`](../docs/VISION.md) — mission, audience, ecosystem placement, differentiation moat, three-year north star, commerce model, trust posture, surface decisions.
  - [`docs/IDEAS.md`](../docs/IDEAS.md) — Pinterest-style boards, full-body visualiser (deferred), Citizen Suggestions board, NGO merch drives, Product Story label, Monthly Highlights, etc, each with feasibility / clutter / persona notes.
  - [`docs/ROADMAP.md`](../docs/ROADMAP.md) — phase-by-phase plan (Shipped → Phase 7 in flight → Phase 8 → Phase 9 → Phase 10+) and the four ADRs to author next (0007 ZA payments, 0008 feed recycling, 0009 multi-brand cart, 0010 NGO drives).

## Previous Batch: PR #8 Posting Repair

Status: shipped on `origin/chore/phase-2-se-poly-hardening` @ `547efdd`.

Implemented:

- Repaired the PR #8 merge splice that left [packages/db/src/contract.ts](../packages/db/src/contract.ts), [packages/db/src/memory.ts](../packages/db/src/memory.ts), [apps/web/src/app/page.tsx](../apps/web/src/app/page.tsx), and [apps/web/src/lib/shell.tsx](../apps/web/src/lib/shell.tsx) syntactically invalid.
- Restored the coherent `origin/main` Phase 3-6 DB contract, in-memory store, Prisma reference schema, homepage, and shell so `/compose`, `/feed`, `/p/[id]`, `/search`, stories, messages, likes, comments, and saves share one runtime API.
- Kept the earlier social-commerce planning artifact as product direction, but marked it as superseded for active DB/API implementation details.

## Previous Batch: Social-Commerce Foundation

Status: superseded for active DB/API implementation by the PR #8 repair; retained as product direction and historical decision context.

Implemented:

- Added [docs/social-commerce-vertical-slice.md](../docs/social-commerce-vertical-slice.md) to preserve the first-slice product, role, UX, and architectural guardrails.
- Extended `@citizens-wear/db` with Wear-owned social-commerce contracts: posts, media references, Connect product tags, likes, saves, comments, cart intent, brand follows, and moderation.
- Mirrored the social-commerce model in [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma), keeping Connect ids as references and preserving brand-post invariants.
- Implemented deterministic in-memory repositories in [packages/db/src/memory.ts](../packages/db/src/memory.ts).
- Expanded DB contract coverage to 27 tests in [packages/db/test/contract.test.ts](../packages/db/test/contract.test.ts).
- Remediated the PostCSS audit finding by pinning PostCSS to `8.5.10` and refreshing [pnpm-lock.yaml](../pnpm-lock.yaml).
- Updated [apps/web/next.config.js](../apps/web/next.config.js) to use top-level `typedRoutes` for Next 15.

## Latest Validation

Run from workspace root on Windows PowerShell. (Reconciliation + validators batch — May 2026)

```
pnpm typecheck   → 0 errors (7 tasks ok)
pnpm test        → 111 passing
                   - @citizens-wear/connect-client (3 files, 38 tests)
                   - @citizens-wear/db             (3 files, 55 tests)
                   - @citizens-wear/web            (3 files, 18 tests — store, connect, validators)
npx next lint --dir src → 0 warnings/errors
Architect review (SE: Architect subagent) → 0 Must-fix; Should-fix items 1–3 + ADR-forward-ref fix applied; nice-to-haves 4, 6 noted; Phase-7 design notes 7–11 captured in ROADMAP.
Security review (SE: Security subagent) → 0 Critical / 0 High; Medium M2 + Low L1 + Low L2 applied (trim, CRLF + control-char + non-http(s)-scheme + backslash-canonicalisation tests); M1 (coverage allow-list → deny-list) and I2 (ESLint rule against `fetch(safeUrl(...))`) deferred to Phase-7 unfurl batch.
```

## Previous Validation

- `pnpm --filter @citizens-wear/db typecheck`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed. `@citizens-wear/connect-client` 38 tests, `@citizens-wear/db` 55 tests, `@citizens-wear/web` 2 tests.
- `pnpm lint`: passed. Next.js `next lint` deprecation notice only.
- `pnpm build`: passed. Next route manifest includes `/compose`, `/feed`, `/p/[id]`, `/search`, `/messages`, `/stories/[id]`, and profile routes.
- `pnpm exec prettier --check --ignore-unknown` on changed files: passed.
- `pnpm audit --audit-level moderate`: passed. No known vulnerabilities found.
- Changed-file secret scan with `Select-String`: passed. No matches for common secret/private-key patterns.
- Supabase security advisors: reachable; existing linked-project baseline has 53 warnings. This slice did not apply Supabase migrations or add new Supabase DDL. Baseline groups:
  - `anon_security_definer_function_executable`: 20 warnings. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable>
  - `authenticated_security_definer_function_executable`: 20 warnings. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable>
  - `function_search_path_mutable`: 6 warnings. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable>
  - `materialized_view_in_api`: 5 warnings. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0016_materialized_view_in_api>
  - `extension_in_public`: 1 warning. Remediation: <https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public>
  - `auth_leaked_password_protection`: 1 warning. Remediation: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>

## Review Gates

- Architecture review: passed for PR #8 repair. Named `Architect` subagent was unavailable in this VS Code session, so the same audit prompt was run through the available subagent. Verdict: approve, with no should-fix findings before commit.
- Security/vibe review: passed for PR #8 repair. Verdict: approve, with launch-gate removal noted as an intentional visibility change from the broken branch splice back to mainline app routes.
- Previous foundation architecture review: passed after fixing post visibility/status filtering, author kind invariants, Prisma brand relation behavior, and moderation auditability.
- Previous foundation security/vibe review: passed after replacing public restricted-list bypass with branded trusted access, enforcing cart item ownership on update/remove, and requiring readable published posts for likes/saves/comments.

## Known Non-Blocking Warnings

- Full-repo `pnpm format:check` is not currently a clean gate because legacy/reference files have pre-existing formatting drift. Changed files from this batch are Prettier-clean.
- Next 15 still emits the `next lint` deprecation notice.
- Build emits a Node `url.parse()` deprecation warning from the toolchain path.
