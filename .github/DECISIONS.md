# Citizens Wear Decisions

## Branch Reconciliation — Phase 4 Local Rewrite vs Canonical Lineage (May 2026)

- **Two divergent lineages** existed for `chore/phase-2-se-poly-hardening`:
  - **Canonical (remote, kept):** `origin/chore/phase-2-se-poly-hardening` at `547efdd` — merged main forward and absorbed PR #3 (Phase 3+4: HTTP Connect client, factory, webhook receiver, SSO callback), PR #4 (Phase 5: discovery, search, hashtags, brand catalog), PR #5 (Phase 6: stories, DMs, blocks, reports, realtime seam), and PR #8 posting repair.
  - **Local (preserved, not promoted):** `05d6407` "Phase 4 — Posts & Feed (Slice C, full)" — pushed to `origin/chore/phase-4-local-rewrite` so the work is not lost. Contained a security-hardened `actions.ts` (re-auth on every call, brand ownership via `client.brands.listForOwner`, citizen product-tag ownership filter, `isSafeMediaUrl` validation, returnPath allowlist for `addToCart`, `Forbidden` thrown — not redirected — for `resolveModeration`), `post-card.tsx`, `MOCK_ADMIN_SIGN_IN_TOKEN` / `ADMIN_MODERATION_SCOPE` / `isAdmin()`, and 22 server-action tests in `apps/web/src/lib/actions.test.ts`.
- **Decision:** Canonical lineage wins as trunk for the next merge to `main` because it is materially more complete (Phases 3–6 vs Phase 4 only). Reconciled by hard-resetting local `chore/phase-2-se-poly-hardening` to `origin/chore/phase-2-se-poly-hardening`. No history was destroyed: `05d6407` remains on `origin/chore/phase-4-local-rewrite` for cherry-picks.
- **Validation after reset (547efdd):** `pnpm typecheck` 0 errors; `pnpm test` 95 passing (db 55 + connect-client 38 + web 2); `npx next lint --dir src` clean.
- **Identified gaps in canonical to address in a follow-up cherry-pick batch (security hardening from `chore/phase-4-local-rewrite`):**
  1. Re-verify `createPost` brand ownership uses `client.brands.listForOwner` rather than slug-only trust.
  2. Re-verify citizen-authored posts drop `taggedProductIds` whose product brand is not owned by the author.
  3. Confirm `isSafeMediaUrl` (rejects `javascript:`, credentials, non-http(s)) is applied before persisting media URLs.
  4. Confirm `addToCart` `returnPath` is allowlist-validated (`/feed`, `/p/[A-Za-z0-9_-]{1,64}`, `/b/`, `/u/`).
  5. Confirm `resolveModeration` throws a `Forbidden` error on missing `admin.moderation` scope rather than redirecting (so privilege escalation surfaces in logs/tests, not as a silent UX bounce).
  6. Confirm `?as=admin` sign-in preset is gated by `process.env.NODE_ENV !== 'production'`.
  7. Port the 22 server-action tests from `05d6407:apps/web/src/lib/actions.test.ts` (auth redirects, brand spoofing, cross-brand tag drops, citizen-tag-without-ownership, `javascript:`/credential URL drops, cart sold-out + clamp + returnPath allowlist, admin-scope authz on `resolveModeration`).
- **Next steps blocked on owner sign-off:** do NOT promote `chore/phase-2-se-poly-hardening` to `main` until items 1–7 above are audited against the canonical lineage and any missing guards are cherry-picked from `origin/chore/phase-4-local-rewrite`.

## PR #8 Posting Repair

- PR #8 resolves the bad merge in favor of the coherent `origin/main` Phase 3-6 DB, homepage, and shell implementation. The active posting contract uses `Post.authorId`, `Post.body`, `taggedProductIds`, `likes`, `comments`, `saves`, stories, reports, blocks, and conversations.
- The social-commerce foundation batch below is retained as product and risk history, but its divergent DB API (`authorUserId`, `caption`, `PostEngagementRepo`, cart intent repos, brand follow repos, and moderation queue repos) is not the current runtime contract.
- Chore branch conflict repairs should prefer the mainline app routes/actions when a branch contains duplicate generations of the same WearStore surface. Reintroduce older slice concepts only as deliberate new work with migration/tests, not as merge-conflict residue.
- The repair restores posting visibility by making `apps/web/src/lib/actions.ts`, `apps/web/src/app/compose/page.tsx`, and `@citizens-wear/db` agree on the same `posts.create({ authorId, body, taggedProductIds })` API.

## Social-Commerce Foundation Batch

- Citizens Wear owns social state: posts, media references, product tags, comments, likes, saves, cart intent, brand follows, profile settings, and moderation state.
- Citizens Connect remains the source of truth for users, brands, products, stock state, and catalog ids. Wear stores Connect ids only and does not invent catalog records.
- The first durable UX direction is hybrid: paper/light surfaces for trust, account, profile, and settings; dark image-first surfaces for feed, shop, saved, cart, and discovery.
- `CreatePostInput` does not accept `authorKind`. The store derives author kind from `brandId` and rejects contradictory runtime input.
- Prisma `Post.authorKind` has no default, and `Post.brand` uses `onDelete: Restrict` so brand posts cannot silently lose their brand id.
- Public post listing defaults to published readable posts. Draft, hidden, rejected, and other restricted listing paths require author visibility or branded trusted access.
- Trusted restricted listing uses `TrustedPostListAccess`; there is no public `includeRestricted` boolean in the shared contract.
- Likes, saves, and comments require the actor to be able to read a published post.
- Cart item updates and removals require both `userId` and `cartItemId`, and the store enforces ownership.
- Moderation items validate post/comment targets on open and cannot be resolved twice.
- PostCSS is pinned to `8.5.10` to remediate the audit finding for `GHSA-qx2v-qp2m-jg93`.
