import { describe, expect, it } from 'vitest';
import { MemoryWearStore, WearStoreError } from '../src/index';
import type { WearStore } from '../src/index';

function makeStore(start: string = '2026-04-18T00:00:00.000Z'): WearStore {
  let t = new Date(start).getTime();
  return new MemoryWearStore({
    now: () => {
      t += 1000;
      return new Date(t);
    },
  });
}

async function seed(store: WearStore) {
  // usr_001 follows usr_002. Plus self-posts.
  await store.follows.follow('usr_001', 'usr_002');
  const older = await store.posts.create({
    authorId: 'usr_002',
    body: 'Older post from a followed brand.',
  });
  const newer = await store.posts.create({
    authorId: 'usr_001',
    body: 'Hot take by the viewer.',
  });
  const stranger = await store.posts.create({
    authorId: 'usr_999',
    body: 'Stranger post — should not appear in chronological feed.',
  });
  return { older, newer, stranger };
}

describe('PostRepo', () => {
  it('rejects empty post bodies', async () => {
    const store = makeStore();
    await expect(store.posts.create({ authorId: 'usr_001', body: '   ' })).rejects.toBeInstanceOf(
      WearStoreError,
    );
  });

  it('creates a post with media and tagged products', async () => {
    const store = makeStore();
    const created = await store.posts.create({
      authorId: 'usr_001',
      brandId: 'brd_001',
      body: 'New drop.',
      taggedProductIds: ['prd_001', 'prd_002'],
      media: [
        { url: 'https://cdn.example/a.jpg', kind: 'image', altText: 'A tee', orderIndex: 1 },
        { url: 'https://cdn.example/b.jpg', kind: 'image', altText: null, orderIndex: 0 },
      ],
    });
    expect(created.post.brandId).toBe('brd_001');
    expect(created.post.taggedProductIds).toEqual(['prd_001', 'prd_002']);
    expect(created.media.map((m) => m.orderIndex)).toEqual([1, 0]);

    const reread = await store.posts.getById(created.post.id);
    // Returned media is sorted by orderIndex.
    expect(reread?.media.map((m) => m.orderIndex)).toEqual([0, 1]);
  });

  it('chronological feed includes posts by followed users and self, excludes strangers', async () => {
    const store = makeStore();
    const { older, newer, stranger } = await seed(store);
    const feed = await store.posts.feedChronological('usr_001');
    const ids = feed.items.map((i) => i.post.id);
    expect(ids).toContain(newer.post.id);
    expect(ids).toContain(older.post.id);
    expect(ids).not.toContain(stranger.post.id);
    // Newest first.
    expect(Date.parse(feed.items[0]!.post.createdAt)).toBeGreaterThanOrEqual(
      Date.parse(feed.items[1]!.post.createdAt),
    );
  });

  it('paginates feed via cursor', async () => {
    const store = makeStore();
    await seed(store);
    const first = await store.posts.feedChronological('usr_001', { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe('1');
    const second = await store.posts.feedChronological('usr_001', {
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.post.id).not.toBe(first.items[0]!.post.id);
  });

  it('feedForYou scores followed authors above strangers', async () => {
    const store = makeStore();
    const { stranger } = await seed(store);
    const feed = await store.posts.feedForYou('usr_001');
    expect(feed.items[feed.items.length - 1]!.post.id).toBe(stranger.post.id);
  });

  it('listByAuthor and listByBrand filter correctly', async () => {
    const store = makeStore();
    const p = await store.posts.create({
      authorId: 'usr_001',
      brandId: 'brd_001',
      body: 'Brand post.',
    });
    await store.posts.create({ authorId: 'usr_001', body: 'Personal post.' });
    const byAuthor = await store.posts.listByAuthor('usr_001');
    expect(byAuthor.items).toHaveLength(2);
    const byBrand = await store.posts.listByBrand('brd_001');
    expect(byBrand.items.map((i) => i.post.id)).toEqual([p.post.id]);
  });
});

describe('LikeRepo', () => {
  it('likes a post idempotently and counts it, then unlikes', async () => {
    const store = makeStore();
    const { post } = await store.posts.create({ authorId: 'usr_001', body: 'hi' });
    await store.likes.likePost(post.id, 'usr_002');
    await store.likes.likePost(post.id, 'usr_002');
    expect(await store.likes.postLikeCount(post.id)).toBe(1);
    expect(await store.likes.isPostLiked(post.id, 'usr_002')).toBe(true);
    await store.likes.unlikePost(post.id, 'usr_002');
    expect(await store.likes.isPostLiked(post.id, 'usr_002')).toBe(false);
  });

  it('rejects likes on unknown posts', async () => {
    const store = makeStore();
    await expect(store.likes.likePost('missing', 'u')).rejects.toBeInstanceOf(WearStoreError);
  });

  it('lists posts liked by a user, newest-first', async () => {
    const store = makeStore();
    const { post: p1 } = await store.posts.create({ authorId: 'usr_001', body: '1' });
    const { post: p2 } = await store.posts.create({ authorId: 'usr_001', body: '2' });
    await store.likes.likePost(p1.id, 'usr_002');
    await store.likes.likePost(p2.id, 'usr_002');
    const likes = await store.likes.postsLikedBy('usr_002');
    expect(likes.map((l) => l.postId)).toEqual([p2.id, p1.id]);
    expect(likes).toHaveLength(2);
  });

  it('likes comments with counts', async () => {
    const store = makeStore();
    const { post } = await store.posts.create({ authorId: 'usr_001', body: 'p' });
    const c = await store.comments.create({ postId: post.id, authorId: 'usr_002', body: 'c' });
    await store.likes.likeComment(c.id, 'usr_001');
    await store.likes.likeComment(c.id, 'usr_001');
    expect(await store.likes.commentLikeCount(c.id)).toBe(1);
    await store.likes.unlikeComment(c.id, 'usr_001');
    expect(await store.likes.commentLikeCount(c.id)).toBe(0);
  });
});

describe('CommentRepo', () => {
  it('lists comments chronologically; threaded via parentCommentId', async () => {
    const store = makeStore();
    const { post } = await store.posts.create({ authorId: 'usr_001', body: 'p' });
    const top = await store.comments.create({
      postId: post.id,
      authorId: 'usr_002',
      body: 'nice',
    });
    const reply = await store.comments.create({
      postId: post.id,
      authorId: 'usr_001',
      body: 'thanks',
      parentCommentId: top.id,
    });
    const all = await store.comments.listForPost(post.id);
    expect(all.map((c) => c.id)).toEqual([top.id, reply.id]);
    expect(reply.parentCommentId).toBe(top.id);
    expect(await store.comments.commentsForPostCount(post.id)).toBe(2);
  });

  it('rejects comments on missing posts and bad parents', async () => {
    const store = makeStore();
    await expect(
      store.comments.create({ postId: 'missing', authorId: 'u', body: 'x' }),
    ).rejects.toBeInstanceOf(WearStoreError);

    const { post } = await store.posts.create({ authorId: 'u', body: 'p' });
    await expect(
      store.comments.create({
        postId: post.id,
        authorId: 'u',
        body: 'x',
        parentCommentId: 'nope',
      }),
    ).rejects.toBeInstanceOf(WearStoreError);
  });

  it('authoredBy lists a user\u2019s comments newest-first', async () => {
    const store = makeStore();
    const { post } = await store.posts.create({ authorId: 'a', body: 'p' });
    await store.comments.create({ postId: post.id, authorId: 'b', body: '1' });
    await store.comments.create({ postId: post.id, authorId: 'b', body: '2' });
    const list = await store.comments.authoredBy('b');
    expect(list.map((c) => c.body)).toEqual(['2', '1']);
  });
});

describe('SaveRepo', () => {
  it('saves and unsaves posts in the default collection', async () => {
    const store = makeStore();
    const { post } = await store.posts.create({ authorId: 'usr_001', body: 'p' });
    expect(await store.saves.isSaved('usr_002', post.id)).toBe(false);
    const coll = await store.saves.savePost('usr_002', post.id);
    expect(coll.name).toBe('default');
    expect(coll.postIds).toContain(post.id);
    expect(await store.saves.isSaved('usr_002', post.id)).toBe(true);
    await store.saves.unsavePost('usr_002', post.id);
    expect(await store.saves.isSaved('usr_002', post.id)).toBe(false);
  });

  it('rejects saving unknown posts', async () => {
    const store = makeStore();
    await expect(store.saves.savePost('u', 'missing')).rejects.toBeInstanceOf(WearStoreError);
  });

  it('rejects saving into a collection the caller does not own', async () => {
    const store = makeStore();
    const { post } = await store.posts.create({ authorId: 'a', body: 'p' });
    const ownerColl = await store.saves.getOrCreateDefault('a');
    await expect(store.saves.savePost('other', post.id, ownerColl.id)).rejects.toBeInstanceOf(
      WearStoreError,
    );
  });
});
