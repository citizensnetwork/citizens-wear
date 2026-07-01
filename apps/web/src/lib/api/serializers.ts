import type { FeedPage, PostWithMedia, WearBrand, WearStore, WearUser } from '@citizens-wear/db';

/**
 * DTO shaping for the `/api/*` surface. Post authors and brands are resolved
 * through the store's own `users`/`brands` repos (the `wear.*` mirror) — no
 * `connect-client` round-trip — so the HTML app gets fully-hydrated cards from
 * one call.
 */

export interface UserDto {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
}

export interface BrandDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly tagline: string | null;
  readonly logoUrl: string | null;
  readonly verified: boolean;
  readonly ownerUserId: string;
}

export interface PostDto {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly taggedProductIds: readonly string[];
  readonly author: UserDto | null;
  readonly brand: BrandDto | null;
  readonly media: readonly {
    readonly url: string;
    readonly kind: string;
    readonly altText: string | null;
  }[];
}

export const toUserDto = (u: WearUser): UserDto => ({
  id: u.id,
  handle: u.handle,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
});

export const toBrandDto = (b: WearBrand): BrandDto => ({
  id: b.id,
  slug: b.slug,
  name: b.name,
  tagline: b.tagline,
  logoUrl: b.logoUrl,
  verified: b.verified,
  ownerUserId: b.ownerUserId,
});

/** Hydrate a single post with its author + (optional) brand. */
export async function hydratePost(store: WearStore, entry: PostWithMedia): Promise<PostDto> {
  const [author, brand] = await Promise.all([
    store.users.getById(entry.post.authorId),
    entry.post.brandId ? store.brands.getById(entry.post.brandId) : Promise.resolve(null),
  ]);
  return {
    id: entry.post.id,
    body: entry.post.body,
    createdAt: entry.post.createdAt,
    taggedProductIds: entry.post.taggedProductIds,
    author: author ? toUserDto(author) : null,
    brand: brand ? toBrandDto(brand) : null,
    media: entry.media.map((m) => ({ url: m.url, kind: m.kind, altText: m.altText })),
  };
}

/** Hydrate a whole feed page, deduping author/brand lookups across items. */
export async function hydrateFeed(
  store: WearStore,
  page: FeedPage,
): Promise<{ items: PostDto[]; nextCursor: string | null }> {
  const userIds = new Set<string>();
  const brandIds = new Set<string>();
  for (const { post } of page.items) {
    userIds.add(post.authorId);
    if (post.brandId) brandIds.add(post.brandId);
  }
  const [users, brands] = await Promise.all([
    Promise.all([...userIds].map((id) => store.users.getById(id))),
    Promise.all([...brandIds].map((id) => store.brands.getById(id))),
  ]);
  const userMap = new Map(users.filter((u): u is WearUser => !!u).map((u) => [u.id, u]));
  const brandMap = new Map(brands.filter((b): b is WearBrand => !!b).map((b) => [b.id, b]));
  return {
    items: page.items.map((entry) => ({
      id: entry.post.id,
      body: entry.post.body,
      createdAt: entry.post.createdAt,
      taggedProductIds: entry.post.taggedProductIds,
      author: userMap.has(entry.post.authorId)
        ? toUserDto(userMap.get(entry.post.authorId)!)
        : null,
      brand: entry.post.brandId && brandMap.has(entry.post.brandId)
        ? toBrandDto(brandMap.get(entry.post.brandId)!)
        : null,
      media: entry.media.map((m) => ({ url: m.url, kind: m.kind, altText: m.altText })),
    })),
    nextCursor: page.nextCursor,
  };
}
