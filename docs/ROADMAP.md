# Citizens Wear — Roadmap

Status snapshot: May 2026. **Current branch: `chore/phase-2-se-poly-hardening` @ `b942f27`** (canonical lineage, awaiting merge to `main` after the Phase 7 batch lands and the Statement of Faith / Code of Conduct content surfaces are ready).

## ✅ Shipped

| Phase | Title | Highlights |
|---|---|---|
| 1 | Foundations + Connect contract | Next 15.5, App Router, Tailwind, CrownMark, ConnectClient + MockConnectClient + fixtures, ADR-0001 stack, ADR-0002 connect contract. |
| 2 | Identity, profiles, follow graph, settings | Cookie session, `/u/[handle]`, `/settings`, follow/unfollow, ADR-0003. |
| 2.5 | SE / poly hardening | Audit-clean deps, coverage gates, CodeQL, Dependabot, security headers. |
| 3 | HTTP Connect client + webhook receiver + SSO callback | Real Connect transport seam (mock-by-default). |
| 4 | Posts, feed, detail, composer, activity, server actions | Full social-commerce slice C. |
| 5 | Discovery, search, hashtags, brand catalog tabs | Open hashtag graph; `/search`, `/h/[tag]`, `/explore`. |
| 6 | Stories, DMs, blocks, reports, realtime seam | Phase 6 social surfaces; `reportSubject` is the canonical moderation entry-point. |
| Reconciliation | Branch reconciliation (May 2026) | Local Phase-4 rewrite preserved on `origin/chore/phase-4-local-rewrite` @ `05d6407`; canonical wins as trunk. `safeUrl` extracted to `validators.ts` with 10 unit tests. |

## 🛠 In flight (Phase 7 — Vision-anchored relaunch)

Goal: align the existing canonical surface with the May-2026 vision before merging to `main`.

| # | Item | Owner-side | Notes |
|---|---|---|---|
| 7.1 | Statement of Faith + Code of Conduct content | content + frontend | Static `/about/faith`, `/about/conduct` pages. Required reading for creators on first publish. |
| 7.2 | Date-based feed ordering + "All caught up" indicator | engineering | Replace pure chrono. Surface a sentinel card when no unseen posts remain. |
| 7.3 | Brand-aware feed recycling | engineering | After "all caught up", surface previously-seen posts ranked by brand-rotation fairness. Compute-light. |
| 7.4 | Citizen username / handle audit | engineering | Confirm every citizen has a unique `handle` (already true in Connect contract); expose username search to admins. |
| 7.5 | Admin role-assignment page | engineering | `/admin/settings/roles` — search by email, assign `editor` / `watcher` / `admin.moderation` scopes. Functions built; staffing UI new. |
| 7.6 | Curated Themes pinning | engineering + editor | Pin 12 editor-controlled Themes to discovery alongside open hashtags. |
| 7.7 | "Wear It" repost (tagged-product gate) | engineering | Allow only when original has `taggedProductIds.length > 0`. |
| 7.8 | Comment shield (brand-level toggle) | engineering | Auto-route flagged terms to mod queue. |
| 7.9 | Hide like/save counts publicly | engineering | Expose to author/owner only. |
| 7.10 | South-African payments due-diligence spike | research | Stripe vs Paystack vs Yoco for ZAR settlement. Outcome will be ratified as the next ADR (TBD — payments). |

## 🔭 Phase 8 — Trust, content, NGO

| # | Item | Notes |
|---|---|---|
| 8.1 | Unified multi-brand cart | Hard one. Phase 8 not 7 because it needs Phase 7.10 payment ADR. |
| 8.2 | Product Story / Inspiration label | New post `kind: 'story'` discriminator. |
| 8.3 | Monthly Highlights (`/highlights`) | Paper-tone editorial surface. |
| 8.4 | NGO / church merch drives + price specials | `Drive` entity, time-bound campaigns. |
| 8.5 | Citizen Suggestions board (`/suggestions`) | Citizens post ideas; creators race to fulfil. |
| 8.6 | Pinterest-style boards / collections | Named boards of saves; public profile tab. |
| 8.7 | Volunteer Watcher staffing flow | Read-only flag privileges; training acceptance step. |
| 8.8 | Org statement-of-purpose page (`/b/[slug]/about`) | Mission, scripture, beneficiary info. |

## 🗺 Phase 9 — Scale & internationalisation

| # | Item | Notes |
|---|---|---|
| 9.1 | Citizen ↔ Citizen DMs | Stricter spam/abuse controls before opening. |
| 9.2 | Citizen kickback (1 % on `#WearIt` repost-driven sales) | Once volume justifies the accounting. |
| 9.3 | Brand verification gold check | Statement of Faith + business license + manual editor review (deferred from MVP). |
| 9.4 | International expansion beyond US/UK/ZA | Per-country payment + tax + content review. |
| 9.5 | "Sealed" tier (paid, ID-verified citizens) | Optional spam-resistant identity. |
| 9.6 | Real-time push notifications | Mobile parity. |

## 🛸 Phase 10+ — Speculative

| # | Item | Notes |
|---|---|---|
| 10.1 | Full-body comparison visualiser | High cost; defer or build as a companion app. Boards (8.6) deliver 80 % of the value first. |
| 10.2 | Native mobile (iOS / Android) | After Phase 9 scale validates the web-first thesis. |
| 10.3 | Citizens Learn / Citizens Connect cross-app deep linking | Coordinated PBO ecosystem launch. |

## Quality gates (every phase, non-negotiable)

Per `/memories/quality-pipeline.md`:

1. `pnpm typecheck` → 0 errors.
2. `pnpm test` → full suite passing.
3. `npx next lint --dir src` → clean.
4. Architect subagent review → apply Should-fix; note Nice-to-haves; re-run tsc + vitest.
5. `mcp_supabase_get_advisors type:"security"` → no NEW warnings vs baseline 53.
6. Commit with Citizens Network identity → push.
7. Update `.github/PROJECT_STATUS.md` and `.github/DECISIONS.md`.
8. Update repo memory and (if applicable) `/memories/session/plan.md`.

## Open ADRs to author

ADR numbers are assigned **at ratification time**, not in advance — listed here as topics only so renumbering / reprioritisation does not leave gaps.

| Topic | Triggering phase |
|---|---|
| South-African payments — Stripe vs Paystack vs Yoco. | Phase 7.10 |
| Date-ordered feed + recycling fairness. | Phase 7.2 / 7.3 |
| Multi-brand unified cart settlement. | Phase 8.1 |
| Drive / Campaign entity (NGO merch drives). | Phase 8.4 |
