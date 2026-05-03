# Citizens Wear — Vision

> **Foundation scripture: Ephesians 2:19–21** — *"So then you are no longer strangers and aliens, but you are fellow citizens with the saints, and members of the household of God, built on the foundation of the apostles and prophets, Christ Jesus himself being the cornerstone, in whom the whole structure, being joined together, grows into a holy temple in the Lord."*

## One-line

**Citizens Wear is the home for all Christian clothing.** Contribute, follow, like, discover, and shop every Kingdom brand in one place.

## Tagline

> **Kingdom Clothing. No Algs. No Fluff. No Exclusion.**

## Why this exists

To give Christians a familiar, trusted environment to **discover, follow, and shop** Kingdom-aligned clothing brands without the noise, manipulation, and content drift of Instagram, TikTok, or Pinterest. The audience is **specifically Christian**. The platform serves Christians.

## Audience

| Persona | Notes |
|---|---|
| **Citizen / consumer** | 18–34, faith-forward, design-literate, looking for modest, modern, Christ-centered apparel. |
| **Creator / contributor** | Solo Christian designer (DTC micro-brand) → established modest-fashion labels. Lead persona at launch is the 0–2-employee micro-brand that needs trust signals more than reach. |
| **NGO / church / organisation** | Wants to create, promote, and sell merch (drives, fundraisers, price specials). First-class persona — features should support time-bound campaigns, not just evergreen products. |
| **Editor / volunteer moderator** | Paid editors curate the monthly Highlights and the Curated tab. Volunteer Watchers (read-only flag privileges) added later. Roles assignable by admin via a settings page. |

## Citizens PBO ecosystem placement

Citizen Wear is one **verb** of the Citizens PBO ecosystem (others include Citizens Connect, Citizens Learn, etc). Each verb is a distinct app with a single, clear function:

- **Citizens Connect** — a *map application*. Visually surfaces all events, companies, stores, marketplaces, providers; gives brief image + details; routes the user to the appropriate sister app upon further enquiry. Connect is the discovery surface that **leads** users into Wear (and other ecosystem apps).
- **Citizens Wear** — the destination for **clothing-specific** social commerce. Owns posts, follows, likes, saves, comments, stories, DMs, cart, moderation. Holds Connect ids only — never SoT user/brand/product data.
- **Citizens Learn / etc.** — additional verbs to be defined.

Wear is **clothing-specific** by name and design. Future apparel-adjacent expansion (print, accessories, home goods) belongs in Wear *only if it remains within "what you wear / clothe yourself in"*; broader lifestyle goods belong in their own ecosystem verb.

## Geography

US, UK, **and South Africa** at MVP. Payment system must support South Africa (ZAR + supported processor — Stripe + Paystack/Yoco evaluation in Phase 7).

## Core loops

### Citizen value loop
**Discover** → **Save** → **Share-with-community** → **Buy** → **Testify** (post wearing it). The "testify" post-purchase content loop is a first-class feature, not aspirational — it closes the loop on the social commerce flywheel.

### Creator value loop
**Publish drop** → **Earn follows** → **Convert to sales** → **Highlight feature** (monthly editorial slot) → **Build trust graph standing**.

## Differentiation moat

1. **Trust graph by design.** Verified Christian brands (verification gate TBD — deferred from MVP), Statement of Faith, manual editor review, and explicit Code of Conduct. **Algorithm choice is copyable; values commitment is not.**
2. **No algorithmic outrage.** Chronological / date-based ranking by default + opt-in "Curated by Editors" rail. No engagement-maximising algorithm — deliberate moat.
3. **Anti-vanity stance.** Like/save counts hidden by default. Creators see their own. No public leaderboards.
4. **Familiar Christian environment.** A space where Christians can browse and explore Christian clothing without context-collapse, brand-hostile content, or off-platform doctrinal disputes.

## Three-year North Star

The default storefront for the next generation of Christian apparel — **1k brands, 100k citizens, $30M GMV by year 3**.

## Commerce

- **Unified cart** spanning multiple brands (Wear abstracts Stripe Connect-style multi-vendor settlement under the hood). Hard to build right; the right call for UX.
- **Creator-fulfilled** at launch — Wear never holds inventory.
- **Take rate: 5 %.** No listing fee. Keeps the Kingdom-friendly micro-brand pipeline open.
- **Citizen kickback (Phase 9):** 1 % to citizens whose `#WearIt` reposts drive a sale, once volume justifies the accounting.
- **Disputes:** creator handles, Wear mediates only on escalation; lean on Stripe Connect's dispute primitives.

## Trust & moderation

- **Brand verification gold check:** *deferred from MVP* — application progression decides this.
- **Citizen verification:** Email only at launch (Gmail-friendly). "Sealed" tier (paid, ID-verified) Phase 8+.
- **Content policy:** Off-topic theology debates are off-platform. Statement of Faith + Code of Conduct published; commerce-adjacent disputes only.
- **Moderation queue:** functions built; staffed at zero at launch. Admin settings page assigns roles (paid editor, volunteer Watcher) by user lookup. Each citizen has a **username** (handle) and a **user id**.
- **SLA:** 24 h ack, 72 h decision. Quarterly transparency report.

## Product surface decisions

| # | Decision | Status |
|---|---|---|
| 11 | Date-based ordering (not pure chrono/alphabetical). "All caught up" indicator (early-Instagram-style). Compute-friendly. Feed recycling strategy: surface previously-seen brand posts after the user reaches "all caught up", to keep brands constantly visible. | TODO Phase 7 |
| 12 | Stories scaffolded (Phase 6). Keep ephemeral 24h for citizens; rebrand brand-side as "Drops" (timed product launches). Open to revision. | Partial |
| 13 | Citizen↔brand DMs only at MVP. Citizen↔citizen Phase 9. | TODO |
| 14 | Comments open by default + brand-level "comment shield" toggle. | TODO |
| 15 | Likes/saves counts hidden publicly. Creators see their own. | TODO |
| 16 | Hashtags + 12 curated Themes pinned to discovery. | Partial (Phase 5 hashtags exist) |
| 17 | "Wear It" reposts allowed only when the original has a tagged product. | TODO |
| 23 | Unified multi-brand cart. | TODO Phase 7 |

## "Stories / Inspiration" feature (Q28)

Creators can publish a **Product Story** label on a post — a long-form-supported piece illustrating purpose, message, vision behind their lines/releases. Acts as native advertising; integrates as a tag on the post; surfaces in discovery and the monthly Highlights. Implemented on the contributor side.

## Monthly "Highlights" (Q29)

Editorial-curated monthly section spotlighting creator posts. Lives at `/editorial` or `/highlights`. Cheap to build given the existing `tone: 'paper'` shell. Phase 8 launch target.

## Ideas pool

See [`docs/IDEAS.md`](IDEAS.md) for unranked feature ideas (Pinterest-style boards, full-body comparison visualiser, Citizen Suggestions board, NGO/church drive features, etc).

## Phased roadmap

See [`docs/ROADMAP.md`](ROADMAP.md).
