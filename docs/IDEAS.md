# Citizens Wear — Ideas Pool

Unranked candidate features captured during the May 2026 vision session. Each entry includes feasibility, clutter risk, and the user-experience persona it serves. Promotion to the roadmap requires explicit decision in [`VISION.md`](VISION.md) or [`ROADMAP.md`](ROADMAP.md).

## A. Discovery & curation

### A1. Pinterest-style boards / collections
- **Persona:** consumer.
- **Description:** Citizens build named boards of saved posts/products to declare interests and aesthetic identity. Boards are public-by-default, shareable, and feed the recommendation surface for editors curating the monthly Highlights.
- **Feasibility:** medium. Re-uses the existing `saves` repo as the storage backbone; adds a `Collection` table joining saves into named groups.
- **Clutter risk:** low if represented as a single tab on the profile, alongside Activity. High if surfaced in the main nav.
- **Recommendation:** Phase 8. Strong fit for the Citizen value loop ("Save → Share-with-community").

### A2. Full-body comparison visualiser
- **Persona:** consumer.
- **Description:** A layered hypothetical — head-to-toe outfit canvas where saved/interested clothing pieces snap together (top, bottom, outerwear, accessories) so the citizen can compare combinations before purchasing.
- **Feasibility:** **high cost / high uncertainty**. Requires consistent product imagery (transparent-background or templated mannequin shots). Without that pipeline this is brittle. Could lean on AI background-removal services in Phase 9+, but adds dependency, cost, and content-moderation scope.
- **Clutter risk:** medium-high — the "modern, minimalistic" north star pushes against a heavy interactive canvas in the main app.
- **Recommendation:** **defer to Phase 10 or treat as an external companion app**. Boards (A1) deliver 80 % of the value at 10 % of the cost.

### A3. Citizen Suggestions board
- **Persona:** consumer → creator bridge.
- **Description:** Citizens publicly post product/style ideas. Creators view and "race to match or create". A creator who fulfils a suggestion gets badge + Highlight eligibility.
- **Feasibility:** medium. Re-uses the post infrastructure with a `kind: 'suggestion'` tag and a `fulfilledBy` link.
- **Clutter risk:** low if scoped to its own `/suggestions` tab in discovery.
- **Recommendation:** Phase 8 — strong cultural fit with "no exclusion" and the Kingdom marketplace ethos. **Promote.**

### A4. Curated Themes (12 pinned)
- **Persona:** consumer + editor.
- Open hashtags + a small editor-curated set of Themes (`#Modesty`, `#Sunday`, `#Streetwear-Kingdom`, etc) pinned to discovery.
- **Recommendation:** Phase 7. Already aligned with VISION decision #16.

## B. NGO / church / organisation features

### B1. Merch drives & price specials
- **Persona:** church / NGO / org-account creator.
- **Description:** Time-bound campaigns with goal trackers ("400/1000 sold by Easter"), price specials, optional donation pass-through, branded landing pages.
- **Feasibility:** medium. Requires a `Drive` / `Campaign` entity with `startsAt`, `endsAt`, `goal`, `donationRecipient?`.
- **Clutter risk:** low — drives only appear on org accounts and surface as a single banner on a brand profile.
- **Recommendation:** Phase 8. **Promote.**

### B2. Statement-of-purpose page for orgs
- Each org account has a `/b/[slug]/about` page with mission, scripture, beneficiary information.
- **Recommendation:** Phase 8.

## C. Creator-side advertising

### C1. Product Story / Inspiration label
- **Persona:** creator.
- **Description:** A long-form post variant where creators express purpose / message / vision behind a clothing line. Acts as native advertising; renders with a "Story" label on the post; surfaces in discovery and the monthly Highlights.
- **Feasibility:** medium. Reuses the `posts` table with a `kind: 'story' | 'standard'` discriminator.
- **Clutter risk:** low.
- **Recommendation:** Phase 8. **Promote.**

### C2. Monthly Highlights
- Editor-curated `/highlights` page; one per month; uses the paper-tone `PageShell`.
- **Recommendation:** Phase 8. Aligned with VISION Q29.

## D. Feed compute & retention

### D1. "All caught up" indicator
- Early-Instagram-style; tells the citizen they have seen every new post since their last visit.
- **Recommendation:** Phase 7. Already aligned with VISION decision #11.

### D2. Feed recycling
- After "all caught up", surface previously-seen posts ranked by brand-rotation fairness so every brand stays visible without algorithmic engagement-chasing.
- **Recommendation:** Phase 7. Already aligned with VISION decision #11.

## E. Trust & community

### E1. Volunteer Watcher role
- Read-only flag privileges; explicit training; surfaced via admin role-assignment page.
- **Recommendation:** Phase 8. Functions built in canonical (`reportSubject`); UI staffing in Phase 8.

### E2. Statement of Faith + Code of Conduct
- Static `/about/faith` and `/about/conduct` pages; required acceptance step at sign-up for creators.
- **Recommendation:** Phase 7.

## F. Out-of-scope (rejected for now)

- **Engagement-maximising algorithm** — explicitly rejected (north-star moat).
- **Public like-count leaderboards** — explicitly rejected (anti-vanity stance).
- **Citizen↔citizen DMs at launch** — deferred to Phase 9.
- **Theological / doctrinal debate forums** — off-platform.
