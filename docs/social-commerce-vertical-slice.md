# Citizens Wear — Social commerce vertical slice

Status: implementation model for the first social-commerce slice.

This document records the product shape for the Citizens Wear overhaul so the
first implementation steps do not live only in chat. It complements the rollout
plan and keeps the user, creator, brand, and admin journeys aligned before UI
work begins.

## Product direction

Citizens Wear is a social media clothing platform for Christian clothing and
wearables. The experience should feel modern, minimal, stylish, and royal: a
hybrid visual system where paper/light surfaces carry trust, account, profile,
and settings moments, while the feed, shop, saved, cart, and discovery surfaces
become dark, image-first, and gold-accented.

The old Citizen Central build is a UX reference, not an architecture source. We
reuse the rhythm of its feed, top navigation, pill tabs, product cards, brand
cards, likes, saves, cart, and creator flows while rebuilding on the current
Next.js, Connect, and WearStore architecture.

## Roles

### Citizen / shopper

- Browses a continual feed of Christian clothing posts and product drops.
- Likes, saves, comments, follows creators or brands, and adds tagged products
  to cart.
- Receives a progressively more relevant feed from follows, likes, saves,
  categories, stock state, and freshness.
- Can browse anonymously, but social mutations require a Citizens session.

### Creator / contributor

- Shares faith-based clothing posts or submits collaboration ideas.
- Tags Connect-owned products when posting for an owned brand.
- Sees draft, pending, approved, rejected, and hidden states.
- Does not get direct catalog ownership unless Citizens Connect identifies them
  as a brand owner.

### Brand owner

- Owns brand identity and product catalog through Citizens Connect.
- Uses Wear to post product-led stories, outfit inspiration, collection drops,
  and community updates.
- Receives brand follows, post engagement, saved-product intent, and cart
  intent as first-party Wear signals.

### Admin / moderator

- Reviews pending creator submissions and flagged content.
- Hides or rejects posts/comments with an auditable moderation item.
- Uses Connect session scopes or roles when real OIDC lands; first slice may use
  mock admin scopes.

## First-slice scope

Included:

- Social post model with media and Connect product tags.
- Feed listing, author listing, and brand listing contracts.
- Likes, saves, comments, cart items, and brand follows.
- Minimal moderation queue for posts/comments/submissions.
- Deterministic in-memory store behavior and contract tests.

Deferred:

- Payment checkout and order fulfilment.
- Production media upload and image processing.
- DMs, stories, realtime notifications, and realtime inventory updates.
- Advanced ranking or opaque recommendation models.
- Public events as a first-class directory until Connect exposes an events
  contract or Wear deliberately owns event posts.

## Architectural guardrails

- Citizens Connect owns users, brands, products, stock state, and catalog ids.
- Citizens Wear owns social state: posts, media references, product tags,
  comments, likes, saves, cart intent, brand follows, profile settings, and
  moderation state.
- Wear never invents Connect user, brand, or product identifiers.
- Social mutations re-authenticate through `getSession()` before write actions.
- Tracking remains limited to personalization signals and product analytics.
- Each implementation stage must pass typecheck, tests, lint, architecture
  review, security/vibe review, and handoff-state persistence before completion.
