# Citizens Wear Decisions

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
