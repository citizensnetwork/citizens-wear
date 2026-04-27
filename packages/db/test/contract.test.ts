import { describe, expect, it } from 'vitest';
import { createTrustedPostListAccess, MemoryWearStore, WearStoreError } from '../src/index';
import type { WearStore } from '../src/index';

/**
 * Contract tests for `WearStore`. Written against the interface — the Prisma
 * implementation that lands in Phase 3 must satisfy exactly the same cases.
 */

function makeStore(): WearStore {
  return new MemoryWearStore({ now: () => new Date('2026-04-18T00:00:00.000Z') });
}

describe('ProfileRepo', () => {
  it('creates a public profile on first read', async () => {
    const store = makeStore();
    expect(await store.profiles.get('usr_001')).toBeNull();
    const profile = await store.profiles.getOrCreate('usr_001');
    expect(profile.visibility).toBe('public');
    expect(profile.verified).toBe(false);
    expect(profile.bio).toBeNull();
    expect(await store.profiles.get('usr_001')).toEqual(profile);
  });

  it('updates bio, visibility, and verified', async () => {
    const store = makeStore();
    await store.profiles.getOrCreate('usr_001');
    const updated = await store.profiles.update('usr_001', {
      bio: 'Saved by grace.',
      visibility: 'private',
      verified: true,
    });
    expect(updated.bio).toBe('Saved by grace.');
    expect(updated.visibility).toBe('private');
    expect(updated.verified).toBe(true);
  });

  it('update creates the profile if it does not yet exist', async () => {
    const store = makeStore();
    const profile = await store.profiles.update('usr_002', { bio: 'hi' });
    expect(profile.bio).toBe('hi');
    expect(profile.visibility).toBe('public');
  });
});

describe('FollowRepo', () => {
  it('follows, reports counts, and unfollows', async () => {
    const store = makeStore();
    await store.follows.follow('usr_001', 'usr_002');
    expect(await store.follows.isFollowing('usr_001', 'usr_002')).toBe(true);
    expect(await store.follows.counts('usr_002')).toEqual({ followers: 1, following: 0 });
    expect(await store.follows.counts('usr_001')).toEqual({ followers: 0, following: 1 });

    await store.follows.unfollow('usr_001', 'usr_002');
    expect(await store.follows.isFollowing('usr_001', 'usr_002')).toBe(false);
    expect(await store.follows.counts('usr_002')).toEqual({ followers: 0, following: 0 });
  });

  it('following the same target twice is idempotent', async () => {
    const store = makeStore();
    await store.follows.follow('usr_001', 'usr_002');
    await store.follows.follow('usr_001', 'usr_002');
    expect((await store.follows.followers('usr_002')).length).toBe(1);
  });

  it('unfollowing a non-existent edge is a no-op', async () => {
    const store = makeStore();
    await expect(store.follows.unfollow('usr_001', 'usr_002')).resolves.toBeUndefined();
  });

  it('rejects self-follow', async () => {
    const store = makeStore();
    await expect(store.follows.follow('usr_001', 'usr_001')).rejects.toBeInstanceOf(WearStoreError);
  });

  it('lists followers and following edges', async () => {
    const store = makeStore();
    await store.follows.follow('usr_001', 'usr_002');
    await store.follows.follow('usr_003', 'usr_002');
    const followers = await store.follows.followers('usr_002');
    expect(followers.map((e) => e.actorId).sort()).toEqual(['usr_001', 'usr_003']);
    const following = await store.follows.following('usr_001');
    expect(following.map((e) => e.targetId)).toEqual(['usr_002']);
  });
});

describe('SettingsRepo', () => {
  it('returns defaults for unknown users', async () => {
    const store = makeStore();
    const s = await store.settings.get('usr_001');
    expect(s.profileVisibility).toBe('public');
    expect(s.displayNameOverride).toBeNull();
  });

  it('persists updates', async () => {
    const store = makeStore();
    const updated = await store.settings.update('usr_001', {
      displayNameOverride: 'Hannah K',
      profileVisibility: 'private',
    });
    expect(updated.displayNameOverride).toBe('Hannah K');
    expect(updated.profileVisibility).toBe('private');
    const reread = await store.settings.get('usr_001');
    expect(reread).toEqual(updated);
  });
});

describe('PostRepo', () => {
  it('creates posts with media and Connect product tags', async () => {
    const store = makeStore();
    const post = await store.posts.create({
      authorUserId: 'usr_001',
      brandId: 'brd_001',
      caption: 'Heavyweight cotton, made for everyday witness.',
      media: [
        {
          url: 'https://example.test/tee.jpg',
          altText: 'Ivory tee on a hanger',
        },
      ],
      productTags: [{ productId: 'prd_001' }],
    });

    expect(post.id).toBe('post_001');
    expect(post.authorKind).toBe('brand');
    expect(post.status).toBe('published');
    expect(post.publishedAt).toBe('2026-04-18T00:00:00.000Z');
    expect(await store.posts.listMedia(post.id)).toEqual([
      {
        id: 'media_001',
        postId: post.id,
        url: 'https://example.test/tee.jpg',
        altText: 'Ivory tee on a hanger',
        sortOrder: 0,
      },
    ]);
    expect(await store.posts.listProductTags(post.id)).toEqual([
      {
        postId: post.id,
        productId: 'prd_001',
        sortOrder: 0,
      },
    ]);
  });

  it('derives author kind from brand id and rejects contradictory runtime input', async () => {
    const store = makeStore();
    const citizenPost = await store.posts.create({
      authorUserId: 'usr_001',
      caption: 'Citizen fit',
    });
    const brandPost = await store.posts.create({
      authorUserId: 'usr_001',
      brandId: 'brd_001',
      caption: 'Brand fit',
    });
    const contradictoryInput = {
      authorUserId: 'usr_001',
      authorKind: 'citizen',
      brandId: 'brd_001',
      caption: 'Contradictory fit',
    } as unknown as Parameters<WearStore['posts']['create']>[0];

    expect(citizenPost.authorKind).toBe('citizen');
    expect(brandPost.authorKind).toBe('brand');
    await expect(store.posts.create(contradictoryInput)).rejects.toBeInstanceOf(WearStoreError);
  });

  it('lists published public posts and supports author, brand, and cursor filters', async () => {
    const store = makeStore();
    const published = await store.posts.create({
      authorUserId: 'usr_001',
      brandId: 'brd_001',
      caption: 'Published drop',
    });
    await store.posts.create({
      authorUserId: 'usr_002',
      caption: 'Draft idea',
      status: 'draft',
    });
    const hidden = await store.posts.create({
      authorUserId: 'usr_003',
      caption: 'Hidden idea',
      status: 'hidden',
    });
    const secondPublished = await store.posts.create({
      authorUserId: 'usr_001',
      brandId: 'brd_001',
      caption: 'Second drop',
    });

    const firstPage = await store.posts.listFeed({ limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBe('1');

    const fullFeed = await store.posts.listFeed();
    expect(fullFeed.items.map((post) => post.id).sort()).toEqual(
      [published.id, secondPublished.id].sort(),
    );
    expect((await store.posts.listForAuthor('usr_001')).items).toHaveLength(2);
    expect((await store.posts.listForBrand('brd_001')).items).toHaveLength(2);
    expect((await store.posts.listFeed({ status: 'draft' })).items).toHaveLength(0);
    expect((await store.posts.listForAuthor('usr_002', { status: 'draft' })).items).toHaveLength(0);
    expect(
      (await store.posts.listForAuthor('usr_002', { viewerUserId: 'usr_002', status: 'draft' }))
        .items,
    ).toEqual([expect.objectContaining({ id: 'post_002' })]);
    expect((await store.posts.listFeed({ status: 'hidden' })).items).toHaveLength(0);
    expect(
      (
        await store.posts.listFeed({
          status: 'hidden',
          trustedAccess: createTrustedPostListAccess(),
        })
      ).items,
    ).toEqual([hidden]);

    const forgedRestrictedParams = {
      status: 'hidden',
      includeRestricted: true,
      trustedAccess: {},
    } as unknown as Parameters<WearStore['posts']['listFeed']>[0];
    expect((await store.posts.listFeed(forgedRestrictedParams)).items).toHaveLength(0);
  });

  it('filters followers-only posts for anonymous users, non-followers, followers, and authors', async () => {
    const store = makeStore();
    const citizenFollowersPost = await store.posts.create({
      authorUserId: 'usr_creator',
      caption: 'Creator followers drop',
      visibility: 'followers',
    });
    const brandFollowersPost = await store.posts.create({
      authorUserId: 'usr_brand_owner',
      brandId: 'brd_001',
      caption: 'Brand followers drop',
      visibility: 'followers',
    });

    expect((await store.posts.listFeed()).items).toEqual([]);
    expect((await store.posts.listFeed({ viewerUserId: 'usr_non_follower' })).items).toEqual([]);

    await store.follows.follow('usr_follower', 'usr_creator');
    expect((await store.posts.listFeed({ viewerUserId: 'usr_follower' })).items).toEqual([
      citizenFollowersPost,
    ]);

    await store.brandFollows.follow('usr_brand_follower', 'brd_001');
    expect((await store.posts.listFeed({ viewerUserId: 'usr_brand_follower' })).items).toEqual([
      brandFollowersPost,
    ]);
    expect(
      (await store.posts.listForAuthor('usr_creator', { viewerUserId: 'usr_creator' })).items,
    ).toEqual([citizenFollowersPost]);
  });

  it('rejects empty captions and missing post updates', async () => {
    const store = makeStore();
    await expect(
      store.posts.create({ authorUserId: 'usr_001', caption: '   ' }),
    ).rejects.toBeInstanceOf(WearStoreError);
    await expect(store.posts.update('missing', { status: 'hidden' })).rejects.toBeInstanceOf(
      WearStoreError,
    );
  });
});

describe('social engagement repos', () => {
  it('likes, unlikes, saves, unsaves, and comments on posts', async () => {
    const store = makeStore();
    const post = await store.posts.create({ authorUserId: 'usr_001', caption: 'New drop' });

    await store.postEngagement.like('usr_002', post.id);
    await store.postEngagement.like('usr_002', post.id);
    expect(await store.postEngagement.isLiked('usr_002', post.id)).toBe(true);
    expect(await store.postEngagement.likeCount(post.id)).toBe(1);
    await store.postEngagement.unlike('usr_002', post.id);
    expect(await store.postEngagement.isLiked('usr_002', post.id)).toBe(false);

    await store.saves.save('usr_002', post.id);
    await store.saves.save('usr_002', post.id);
    expect(await store.saves.isSaved('usr_002', post.id)).toBe(true);
    expect((await store.saves.listForUser('usr_002')).items).toHaveLength(1);
    await store.saves.unsave('usr_002', post.id);
    expect(await store.saves.isSaved('usr_002', post.id)).toBe(false);

    const comment = await store.comments.create({
      postId: post.id,
      authorUserId: 'usr_002',
      body: 'Beautiful work.',
    });
    expect((await store.comments.listForPost(post.id)).items.map((item) => item.id)).toEqual([
      comment.id,
    ]);
    await store.comments.hide(comment.id);
    expect((await store.comments.listForPost(post.id)).items).toHaveLength(0);
  });

  it('rejects social actions for missing posts or empty comments', async () => {
    const store = makeStore();
    await expect(store.postEngagement.like('usr_001', 'missing')).rejects.toBeInstanceOf(
      WearStoreError,
    );
    await expect(store.saves.save('usr_001', 'missing')).rejects.toBeInstanceOf(WearStoreError);
    await expect(
      store.comments.create({ postId: 'missing', authorUserId: 'usr_001', body: 'Hi' }),
    ).rejects.toBeInstanceOf(WearStoreError);

    const post = await store.posts.create({ authorUserId: 'usr_001', caption: 'New drop' });
    await expect(
      store.comments.create({ postId: post.id, authorUserId: 'usr_002', body: '   ' }),
    ).rejects.toBeInstanceOf(WearStoreError);
  });

  it('requires readable published posts for social mutations', async () => {
    const store = makeStore();
    const draft = await store.posts.create({
      authorUserId: 'usr_author',
      caption: 'Draft drop',
      status: 'draft',
    });
    const hidden = await store.posts.create({
      authorUserId: 'usr_author',
      caption: 'Hidden drop',
      status: 'hidden',
    });
    const followersOnly = await store.posts.create({
      authorUserId: 'usr_creator',
      caption: 'Followers drop',
      visibility: 'followers',
    });

    await expect(store.postEngagement.like('usr_author', draft.id)).rejects.toBeInstanceOf(
      WearStoreError,
    );
    await expect(
      store.comments.create({ postId: draft.id, authorUserId: 'usr_author', body: 'Not yet' }),
    ).rejects.toBeInstanceOf(WearStoreError);
    await expect(store.saves.save('usr_reader', hidden.id)).rejects.toBeInstanceOf(WearStoreError);
    await expect(store.postEngagement.like('usr_reader', followersOnly.id)).rejects.toBeInstanceOf(
      WearStoreError,
    );
    await expect(
      store.comments.create({ postId: followersOnly.id, authorUserId: 'usr_reader', body: 'Hi' }),
    ).rejects.toBeInstanceOf(WearStoreError);

    await store.follows.follow('usr_reader', 'usr_creator');
    await expect(store.postEngagement.like('usr_reader', followersOnly.id)).resolves.toEqual(
      expect.objectContaining({ actorUserId: 'usr_reader', postId: followersOnly.id }),
    );
    await expect(store.saves.save('usr_reader', followersOnly.id)).resolves.toEqual(
      expect.objectContaining({ userId: 'usr_reader', postId: followersOnly.id }),
    );
    await expect(
      store.comments.create({
        postId: followersOnly.id,
        authorUserId: 'usr_reader',
        body: 'Now visible',
      }),
    ).resolves.toEqual(expect.objectContaining({ body: 'Now visible' }));
  });
});

describe('CartRepo', () => {
  it('adds products, consolidates quantities, updates counts, and clears cart intent', async () => {
    const store = makeStore();
    const first = await store.cart.addItem('usr_001', 'prd_001', 2);
    const consolidated = await store.cart.addItem('usr_001', 'prd_001', 1);
    expect(consolidated.id).toBe(first.id);
    expect(consolidated.quantity).toBe(3);

    await store.cart.addItem('usr_001', 'prd_002');
    expect(await store.cart.countForUser('usr_001')).toBe(4);
    expect(await store.cart.listForUser('usr_001')).toHaveLength(2);

    const updated = await store.cart.updateQuantity('usr_001', first.id, 5);
    expect(updated.quantity).toBe(5);
    await store.cart.removeItem('usr_001', first.id);
    expect(await store.cart.countForUser('usr_001')).toBe(1);

    await store.cart.clear('usr_001');
    expect(await store.cart.listForUser('usr_001')).toEqual([]);
  });

  it('rejects invalid quantities', async () => {
    const store = makeStore();
    await expect(store.cart.addItem('usr_001', 'prd_001', 0)).rejects.toBeInstanceOf(
      WearStoreError,
    );
  });

  it('rejects cross-user cart item updates and removals', async () => {
    const store = makeStore();
    const item = await store.cart.addItem('usr_001', 'prd_001');

    await expect(store.cart.updateQuantity('usr_002', item.id, 2)).rejects.toBeInstanceOf(
      WearStoreError,
    );
    await expect(store.cart.removeItem('usr_002', item.id)).rejects.toBeInstanceOf(WearStoreError);
    expect(await store.cart.countForUser('usr_001')).toBe(1);
  });
});

describe('BrandFollowRepo', () => {
  it('follows brands idempotently and reports followers/following', async () => {
    const store = makeStore();
    await store.brandFollows.follow('usr_001', 'brd_001');
    await store.brandFollows.follow('usr_001', 'brd_001');
    await store.brandFollows.follow('usr_002', 'brd_001');

    expect(await store.brandFollows.isFollowing('usr_001', 'brd_001')).toBe(true);
    expect(await store.brandFollows.counts('brd_001')).toEqual({ followers: 2 });
    expect(await store.brandFollows.followers('brd_001')).toHaveLength(2);
    expect(await store.brandFollows.following('usr_001')).toHaveLength(1);

    await store.brandFollows.unfollow('usr_001', 'brd_001');
    expect(await store.brandFollows.isFollowing('usr_001', 'brd_001')).toBe(false);
  });
});

describe('ModerationRepo', () => {
  it('opens queue items and resolving post moderation updates the post status', async () => {
    const store = makeStore();
    const post = await store.posts.create({
      authorUserId: 'usr_001',
      caption: 'Review me',
      status: 'pending_review',
    });
    const item = await store.moderation.open({
      targetType: 'post',
      targetId: post.id,
      reporterUserId: 'usr_002',
      reason: 'Creator submission',
    });

    expect((await store.moderation.listQueue()).items.map((queued) => queued.id)).toEqual([
      item.id,
    ]);

    const resolved = await store.moderation.resolve(
      item.id,
      'usr_admin',
      'approved',
      'Looks good.',
    );
    expect(resolved.status).toBe('approved');
    expect(resolved.resolvedAt).toBe('2026-04-18T00:00:00.000Z');
    expect((await store.posts.get(post.id))?.status).toBe('published');
    expect((await store.moderation.listQueue()).items).toHaveLength(0);
  });

  it('resolving comment moderation can hide comments', async () => {
    const store = makeStore();
    const post = await store.posts.create({ authorUserId: 'usr_001', caption: 'New drop' });
    const comment = await store.comments.create({
      postId: post.id,
      authorUserId: 'usr_002',
      body: 'Needs review',
    });
    const item = await store.moderation.open({
      targetType: 'comment',
      targetId: comment.id,
      reason: 'Flagged comment',
    });

    await store.moderation.resolve(item.id, 'usr_admin', 'hidden');
    expect((await store.comments.get(comment.id))?.status).toBe('hidden');
  });

  it('rejects missing moderation targets and already resolved queue items', async () => {
    const store = makeStore();
    await expect(
      store.moderation.open({
        targetType: 'post',
        targetId: 'missing_post',
        reason: 'Missing post',
      }),
    ).rejects.toBeInstanceOf(WearStoreError);
    await expect(
      store.moderation.open({
        targetType: 'comment',
        targetId: 'missing_comment',
        reason: 'Missing comment',
      }),
    ).rejects.toBeInstanceOf(WearStoreError);

    const post = await store.posts.create({
      authorUserId: 'usr_001',
      caption: 'Review me once',
      status: 'pending_review',
    });
    const item = await store.moderation.open({
      targetType: 'post',
      targetId: post.id,
      reason: 'Creator submission',
    });

    await store.moderation.resolve(item.id, 'usr_admin', 'approved');
    await expect(
      store.moderation.resolve(item.id, 'usr_admin_002', 'hidden'),
    ).rejects.toBeInstanceOf(WearStoreError);
  });
});

describe('seeding', () => {
  it('honours seeded profiles, follows, and settings', async () => {
    const store = new MemoryWearStore({
      seedProfiles: [
        {
          userId: 'usr_001',
          bio: 'seed',
          visibility: 'private',
          verified: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      seedFollows: [
        {
          actorId: 'usr_002',
          targetId: 'usr_001',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      seedSettings: [
        {
          userId: 'usr_001',
          displayNameOverride: 'Seed',
          profileVisibility: 'private',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect((await store.profiles.get('usr_001'))?.bio).toBe('seed');
    expect(await store.follows.isFollowing('usr_002', 'usr_001')).toBe(true);
    expect((await store.settings.get('usr_001')).displayNameOverride).toBe('Seed');
  });

  it('honours seeded social-commerce state', async () => {
    const store = new MemoryWearStore({
      seedPosts: [
        {
          id: 'post_seed',
          authorUserId: 'usr_001',
          authorKind: 'brand',
          brandId: 'brd_001',
          caption: 'seed post',
          status: 'published',
          visibility: 'public',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      seedPostLikes: [
        {
          actorUserId: 'usr_002',
          postId: 'post_seed',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      seedSavedPosts: [
        {
          userId: 'usr_002',
          postId: 'post_seed',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      seedCartItems: [
        {
          id: 'cart_seed',
          userId: 'usr_002',
          productId: 'prd_001',
          quantity: 2,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      seedBrandFollows: [
        {
          userId: 'usr_002',
          brandId: 'brd_001',
          createdAt: '2026-01-02T00:00:00.000Z',
        },
      ],
    });

    expect((await store.posts.listFeed()).items.map((post) => post.id)).toEqual(['post_seed']);
    expect(await store.postEngagement.likeCount('post_seed')).toBe(1);
    expect(await store.saves.isSaved('usr_002', 'post_seed')).toBe(true);
    expect(await store.cart.countForUser('usr_002')).toBe(2);
    expect(await store.brandFollows.isFollowing('usr_002', 'brd_001')).toBe(true);
  });
});
