# ADR-0006 — Stories, direct messages, and the realtime seam

- **Status:** Accepted (Phase 6)
- **Date:** 2026-04-18
- **Deciders:** Citizens Network / Citizens Wear maintainers
- **Supersedes:** none
- **Superseded by:** none

## Context

Phase 6 of `docs/rollout-plan.md` lands the synchronous-feel surfaces of
the social loop: 24-hour ephemeral _stories_ and 1:1 / group _direct
messages_, plus the moderation primitives that exist primarily to keep
those surfaces livable (block, report). These features push two new
constraints onto the codebase that prior phases did not:

1. **Time-bounded data.** A story is only meaningful for 24 hours; after
   that it disappears from public view but remains addressable by the
   author so it can be promoted into a long-lived _highlight_.
2. **Push, not pull.** A DM that takes a full page reload to appear is
   not a DM. Eventually messages, typing indicators, story posts, and
   read receipts must reach connected clients in milliseconds across an
   arbitrary number of nodes.

We are intentionally _not_ shipping a broker in this phase — Wear still
runs as a single-process Next.js app on a single node, and standing up
Redis pub/sub or NATS would be ARCH-GATE 4 work. But we _are_ shipping
the seam those brokers will plug into, so Phase 9 can swap the adapter
without touching call sites.

We also carry forward the same posture that has shaped every prior
phase: Connect-issued ids are the only identities Wear stores; every
mutation re-authenticates via `getSession()`; the in-memory store is the
default runtime and the contract tests are the source of truth.

## Decision

### 1. Stories are first-class rows with a materialised `expiresAt`

`Story` lives in `packages/db` alongside `Post` rather than reusing it.
Reasons:

- The 24-hour TTL is a property of the row, not a query convention.
  Storing `expiresAt` at write-time lets a future cleanup job index on
  it directly and lets the live-store implementation answer "is this
  still visible?" without a per-request `now()` join.
- Stories carry a closed `audience` enum (`public | followers`) that
  Posts do not. Mixing the two would muddy `PostRepo` and force every
  feed query to filter on a discriminator column.
- Reactions on stories are a fixed five-emoji enum (`amen | love |
  fire | pray | crown`) — distinct from the open numeric like count on
  posts — so a separate `StoryReaction` table keeps the post-likes
  semantics clean.

`StoryRepo` exposes `listActiveForViewer`, `trayForViewer`, and
`recordView`. The tray groups active stories by author, surfaces unseen
authors first (the viewer's own row always sits leftmost), and is the
single source the feed renders from. Authors can `delete` their own
story before expiry; doing so cascades to views, reactions, and
highlight membership.

`HighlightRepo` is intentionally minimal — name, optional cover, and an
ordered `storyIds` array. A highlight may only contain its owner's own
stories; the repo enforces this so client UIs do not have to.

### 2. Direct messages model conversations as the unit, not pairs of users

`Conversation` is either `direct` (always two members) or `group`. A 1:1
conversation is keyed by its members, not by a `(userA, userB)` tuple,
so a single conversation row carries the entire history regardless of
which side opens it. `getOrCreateDirect` is idempotent and rejects
self-DMs and DMs into a blocked pair.

`ConversationMember` carries the per-user state that makes a chat feel
like a chat: `lastReadAt` (drives unread counts), `mutedUntil`,
`requestState`, and `role`. Crucially, `requestState` is _per-side_, not
per-conversation: when a non-mutual sends a DM, the recipient's
membership lands in `requested` and they cannot reply (or be replied
to) until they accept. This keeps message-request semantics symmetric
with the way Instagram and Signal treat first-contact DMs while still
letting the sender see their own outgoing history.

`MessageRepo.deleteOwn` is a soft-delete that nulls the body and stamps
`deletedAt`; the message row stays so the thread doesn't lose its
ordering, and the UI renders "(message deleted)" in place of the
content. Hard-deletes are out of scope and would require an audit trail
the moderation tooling in Phase 9 will own.

### 3. Block is symmetric and severs the follow graph in both directions

A `Block` edge from `actorId` to `targetId` makes the pair invisible to
each other for stories, DMs, and reactions — `isBlockedEither(a, b)` is
the single check every read path uses. Blocking also unfollows in
_both_ directions; this matches user intuition (we have no concept of
"blocked but still following each other") and prevents a class of
follow-graph bugs where a stale edge survives a block.

Reports are deliberately open-ended in this phase: a closed enum of
`subjectKind` and `reason`, an optional 2 KB note, and the reporter's
id. There is no admin queue UI yet — that is Phase 9 — but reports are
structured the right way from day one so the queue can be built on top
of `ReportRepo.listForSubject` without a migration.

### 4. The `RealtimeBus` interface is the seam for Phase 9

We add `RealtimeBus`, `RealtimeEvent`, and `MemoryRealtimeBus` to
`@citizens-wear/db`. Topics are scoped strings
(`conv:${conversationId}`, `user:${userId}`, `story:${storyId}`) and
events are a closed union — adding a new event kind is intentionally a
breaking change so consumers get TypeScript exhaustiveness on
`event.kind`.

The default adapter is single-process and in-memory: a Map of topics to
listener sets, with per-listener error isolation so a faulty subscriber
cannot starve the rest. This is enough to exercise the contract from
server actions and to back a Phase 7 SSE/WebSocket endpoint. A
broker-backed adapter (Redis pub/sub, NATS, or a managed service) lands
with Phase 9 and must satisfy the same `RealtimeBus` surface, so call
sites — including the server actions in `apps/web/src/lib/actions.ts`
that already publish `message.created`, `conversation.read`,
`story.posted`, and `story.reaction` events — do not change.

What we explicitly **defer** to Phase 9:

- An SSE or WebSocket transport on top of the bus. The Next.js `app`
  router does not yet have a stable streaming primitive that survives
  edge runtime changes, and we did not want to ship a client bundle
  in this phase that might have to be torn out later.
- Typing indicators surfaced in the UI. The bus already emits
  `conversation.typing` events; the action that publishes them is the
  one piece of the realtime fan-out we'll wire when the transport
  lands.
- Cross-node fan-out. The interface is the contract; the broker is the
  implementation choice.

### 5. UI surfaces follow the existing server-rendered conventions

Every Phase 6 route is a server component reachable without a client
bundle, mirroring Phases 4 and 5:

- `/feed` gains a `<StoryTray />` strip above the post list.
- `/stories/[id]` is the full-page viewer with prev/next siblings
  scoped to the same author, reaction buttons, an author-only viewer
  count, and a folded report form.
- `/compose/story` is a plain HTML form bound to the `createStory`
  action. Stories accept text, image-by-URL, or video-by-URL today;
  the upload pipeline lands in Phase 9.
- `/messages` is the inbox with `inbox` / `requests` tabs.
- `/messages/[id]` is the thread (server-rendered list, plain
  `<form>` for new messages, accept/decline for pending requests).
- `/messages/new` is a one-field handle picker that calls
  `getOrCreateDirect`.
- The user profile page gains Message and Block/Unblock buttons
  alongside Follow, plus a Highlights strip.
- The `PageShell` adds a Messages link visible only to signed-in
  viewers.

All inputs are server-validated against closed enums; URLs pasted into
the story composer are parsed with `new URL()` and rejected unless they
are `http:` or `https:`, so the action never trusts an arbitrary
scheme into the rendered page.

## Consequences

**Positive**

- The data contract for stories, DMs, blocks, and reports is the same
  shape Postgres will land in Phase 7+. The Prisma schema is updated
  in lockstep; the in-memory store is the runtime.
- Every Phase 6 mutation runs through the same `getSession()` →
  validate → store path the rest of the app uses; no new auth surface
  was introduced.
- The realtime contract is a one-line change to swap implementations,
  which means the Phase 9 broker decision can be made independently
  of any UI work that has already shipped.
- Block-symmetry plus the "blocking unfollows both edges" rule
  eliminates a whole category of stale-edge bugs that mainstream
  platforms ship and then patch one by one.

**Negative / accepted**

- Realtime is _present_ as an interface but not yet _wired_ to any
  client transport, so the inbox and stories surfaces still need a
  page reload to see new content. We accept this for the phase: the
  alternative was shipping a transport we'd have to rewrite when the
  broker lands.
- Stories ship without an upload pipeline. Authors paste a media URL.
  This is consistent with Phase 4's post composer and will be
  replaced wholesale by the Phase 9 media service.
- Soft-deleted messages still occupy a row. This is by design (we
  keep ordering stable) but means a future hard-delete path will need
  an audit trail.
- Group DMs work but have no member-management UI yet (add/remove,
  rename). The repo supports it; the surface comes with Phase 7's
  notifications-and-settings depth pass.

**Out of scope**

- Encrypted DMs. The roadmap calls these out as a Phase 9 concern; we
  do not pretend otherwise.
- Story stickers, polls, music, location pins, AR effects. Wear's
  positioning is intentionally text-and-image-first.
- Federation of conversations across instances.
