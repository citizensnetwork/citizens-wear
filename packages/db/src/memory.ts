import type {
  Comment,
  CommentLikeEdge,
  CommentRepo,
  ConnectId,
  FeedPage,
  FeedPageParams,
  FollowCounts,
  FollowEdge,
  FollowRepo,
  LikeEdge,
  LikeRepo,
  Post,
  PostMedia,
  PostRepo,
  PostWithMedia,
  Profile,
  ProfileRepo,
  SaveCollection,
  SaveRepo,
  SettingsRepo,
  TrendingHashtag,
  UserSettings,
  WearStore,
} from './contract';
import { WearStoreError } from './contract';
import { extractHashtags, normaliseHashtag } from './hashtags';

/**
 * In-memory implementation of `WearStore`.
 *
 * Used by app runtime (no DB yet) and by contract tests. Replaced in Phase 3
 * with a Prisma-backed implementation bound to the schema in
 * `prisma/schema.prisma`. Consumers must program against the interfaces in
 * `./contract`, never against this class directly.
 */
export interface MemoryWearStoreOptions {
  readonly now?: () => Date;
  readonly seedProfiles?: readonly Profile[];
  readonly seedFollows?: readonly FollowEdge[];
  readonly seedSettings?: readonly UserSettings[];
  readonly seedPosts?: readonly PostWithMedia[];
  readonly seedLikes?: readonly LikeEdge[];
  readonly seedComments?: readonly Comment[];
}

export class MemoryWearStore implements WearStore {
  public readonly profiles: ProfileRepo;
  public readonly follows: FollowRepo;
  public readonly settings: SettingsRepo;
  public readonly posts: PostRepo;
  public readonly likes: LikeRepo;
  public readonly comments: CommentRepo;
  public readonly saves: SaveRepo;

  private readonly _now: () => Date;
  private readonly _profiles = new Map<ConnectId, Profile>();
  private readonly _settings = new Map<ConnectId, UserSettings>();
  /** Keyed by `${actorId}->${targetId}`. */
  private readonly _follows = new Map<string, FollowEdge>();
  private readonly _posts = new Map<string, Post>();
  private readonly _postMedia = new Map<string, PostMedia[]>();
  /** Keyed by `${postId}:${userId}`. */
  private readonly _likes = new Map<string, LikeEdge>();
  private readonly _comments = new Map<string, Comment>();
  /** Keyed by `${commentId}:${userId}`. */
  private readonly _commentLikes = new Map<string, CommentLikeEdge>();
  private readonly _saveCollections = new Map<string, SaveCollection>();
  /** Keyed by `${collectionId}:${postId}`. */
  private readonly _savedPosts = new Set<string>();
  private _nextId = 1;

  public constructor(options: MemoryWearStoreOptions = {}) {
    this._now = options.now ?? (() => new Date());

    for (const p of options.seedProfiles ?? []) {
      this._profiles.set(p.userId, p);
    }
    for (const s of options.seedSettings ?? []) {
      this._settings.set(s.userId, s);
    }
    for (const f of options.seedFollows ?? []) {
      this._follows.set(edgeKey(f.actorId, f.targetId), f);
    }
    for (const pm of options.seedPosts ?? []) {
      this._posts.set(pm.post.id, pm.post);
      this._postMedia.set(pm.post.id, [...pm.media]);
    }
    for (const l of options.seedLikes ?? []) {
      this._likes.set(`${l.postId}:${l.userId}`, l);
    }
    for (const c of options.seedComments ?? []) {
      this._comments.set(c.id, c);
    }

    this.profiles = {
      get: async (userId) => this._profiles.get(userId) ?? null,
      getOrCreate: async (userId) => {
        const existing = this._profiles.get(userId);
        if (existing) return existing;
        const created: Profile = {
          userId,
          bio: null,
          visibility: 'public',
          verified: false,
          createdAt: this._now().toISOString(),
          updatedAt: this._now().toISOString(),
        };
        this._profiles.set(userId, created);
        return created;
      },
      update: async (userId, patch) => {
        const current = this._profiles.get(userId) ?? {
          userId,
          bio: null,
          visibility: 'public' as const,
          verified: false,
          createdAt: this._now().toISOString(),
          updatedAt: this._now().toISOString(),
        };
        const next: Profile = {
          ...current,
          ...patch,
          updatedAt: this._now().toISOString(),
        };
        this._profiles.set(userId, next);
        return next;
      },
    };

    this.follows = {
      follow: async (actorId, targetId) => {
        if (actorId === targetId) {
          throw new WearStoreError('self_follow', 'A user cannot follow themselves.');
        }
        const key = edgeKey(actorId, targetId);
        const existing = this._follows.get(key);
        if (existing) return existing;
        const edge: FollowEdge = {
          actorId,
          targetId,
          createdAt: this._now().toISOString(),
        };
        this._follows.set(key, edge);
        return edge;
      },
      unfollow: async (actorId, targetId) => {
        this._follows.delete(edgeKey(actorId, targetId));
      },
      isFollowing: async (actorId, targetId) => this._follows.has(edgeKey(actorId, targetId)),
      counts: async (userId): Promise<FollowCounts> => {
        let followers = 0;
        let following = 0;
        for (const edge of this._follows.values()) {
          if (edge.targetId === userId) followers += 1;
          if (edge.actorId === userId) following += 1;
        }
        return { followers, following };
      },
      followers: async (userId) => [...this._follows.values()].filter((e) => e.targetId === userId),
      following: async (userId) => [...this._follows.values()].filter((e) => e.actorId === userId),
    };

    this.settings = {
      get: async (userId) => {
        const existing = this._settings.get(userId);
        if (existing) return existing;
        const created: UserSettings = {
          userId,
          displayNameOverride: null,
          profileVisibility: 'public',
          createdAt: this._now().toISOString(),
          updatedAt: this._now().toISOString(),
        };
        this._settings.set(userId, created);
        return created;
      },
      update: async (userId, patch) => {
        const current = await this.settings.get(userId);
        const next: UserSettings = {
          ...current,
          ...patch,
          updatedAt: this._now().toISOString(),
        };
        this._settings.set(userId, next);
        return next;
      },
    };

    this.posts = {
      create: async (input): Promise<PostWithMedia> => {
        if (!input.body.trim()) {
          throw new WearStoreError('empty_post', 'Post body must not be empty.');
        }
        const id = this._id('pst');
        const createdAt = this._now().toISOString();
        const post: Post = {
          id,
          authorId: input.authorId,
          brandId: input.brandId ?? null,
          body: input.body,
          createdAt,
          updatedAt: createdAt,
          taggedProductIds: [...(input.taggedProductIds ?? [])],
        };
        const media: PostMedia[] = (input.media ?? []).map((m, i) => ({
          ...m,
          id: this._id('med'),
          postId: id,
          orderIndex: m.orderIndex ?? i,
        }));
        this._posts.set(id, post);
        this._postMedia.set(id, media);
        return { post, media };
      },
      getById: async (id) => this._readPost(id),
      listByAuthor: async (authorId, params) =>
        this._paginate(
          [...this._posts.values()].filter((p) => p.authorId === authorId),
          params,
        ),
      listByBrand: async (brandId, params) =>
        this._paginate(
          [...this._posts.values()].filter((p) => p.brandId === brandId),
          params,
        ),
      feedChronological: async (viewerId, params) => {
        const following = new Set<ConnectId>([viewerId]);
        for (const edge of this._follows.values()) {
          if (edge.actorId === viewerId) following.add(edge.targetId);
        }
        const items = [...this._posts.values()].filter((p) => following.has(p.authorId));
        return this._paginate(items, params);
      },
      feedForYou: async (viewerId, params) => {
        // Feature-flagged stub: score = 2 * isFollowed + freshness.
        // Phase 5 replaces this with a ranking service.
        const following = new Set<ConnectId>([viewerId]);
        for (const edge of this._follows.values()) {
          if (edge.actorId === viewerId) following.add(edge.targetId);
        }
        const nowMs = this._now().getTime();
        const scored = [...this._posts.values()].map((p) => {
          const ageMs = nowMs - Date.parse(p.createdAt);
          const freshness = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 7));
          const followBoost = following.has(p.authorId) ? 2 : 0;
          return { post: p, score: followBoost + freshness };
        });
        scored.sort(
          (a, b) =>
            b.score - a.score || Date.parse(b.post.createdAt) - Date.parse(a.post.createdAt),
        );
        return this._paginate(
          scored.map((s) => s.post),
          params,
          /*alreadySorted*/ true,
        );
      },
      searchByText: async (query, params) => {
        const q = query.trim().toLowerCase();
        if (!q) return this._paginate([], params);
        const matches = [...this._posts.values()].filter((p) => p.body.toLowerCase().includes(q));
        return this._paginate(matches, params);
      },
      listByHashtag: async (tag, params) => {
        const needle = normaliseHashtag(tag);
        if (!needle) return this._paginate([], params);
        const matches = [...this._posts.values()].filter((p) =>
          extractHashtags(p.body).includes(needle),
        );
        return this._paginate(matches, params);
      },
      trendingHashtags: async (options) => {
        const limit = Math.max(1, Math.min(50, options?.limit ?? 10));
        const windowMs = options?.windowMs ?? 1000 * 60 * 60 * 24 * 14;
        const nowMs = this._now().getTime();
        const counts = new Map<string, { count: number; score: number }>();
        for (const p of this._posts.values()) {
          const ageMs = nowMs - Date.parse(p.createdAt);
          const freshness = ageMs <= windowMs ? 1 - ageMs / windowMs : 0;
          for (const tag of extractHashtags(p.body)) {
            const current = counts.get(tag) ?? { count: 0, score: 0 };
            current.count += 1;
            current.score += 1 + freshness;
            counts.set(tag, current);
          }
        }
        const ranked: TrendingHashtag[] = [...counts.entries()]
          .map(([tag, v]) => ({ tag, postCount: v.count, score: v.score }))
          .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
        return ranked.slice(0, limit);
      },
    };

    this.likes = {
      likePost: async (postId, userId) => {
        if (!this._posts.has(postId)) {
          throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
        }
        const key = `${postId}:${userId}`;
        const existing = this._likes.get(key);
        if (existing) return existing;
        const edge: LikeEdge = { postId, userId, createdAt: this._now().toISOString() };
        this._likes.set(key, edge);
        return edge;
      },
      unlikePost: async (postId, userId) => {
        this._likes.delete(`${postId}:${userId}`);
      },
      isPostLiked: async (postId, userId) => this._likes.has(`${postId}:${userId}`),
      postLikeCount: async (postId) => {
        let n = 0;
        for (const l of this._likes.values()) if (l.postId === postId) n += 1;
        return n;
      },
      likeComment: async (commentId, userId) => {
        if (!this._comments.has(commentId)) {
          throw new WearStoreError('comment_not_found', `Unknown comment ${commentId}.`);
        }
        const key = `${commentId}:${userId}`;
        const existing = this._commentLikes.get(key);
        if (existing) return existing;
        const edge: CommentLikeEdge = {
          commentId,
          userId,
          createdAt: this._now().toISOString(),
        };
        this._commentLikes.set(key, edge);
        return edge;
      },
      unlikeComment: async (commentId, userId) => {
        this._commentLikes.delete(`${commentId}:${userId}`);
      },
      commentLikeCount: async (commentId) => {
        let n = 0;
        for (const l of this._commentLikes.values()) if (l.commentId === commentId) n += 1;
        return n;
      },
      postsLikedBy: async (userId) =>
        [...this._likes.values()]
          .filter((l) => l.userId === userId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    };

    this.comments = {
      create: async ({ postId, authorId, body, parentCommentId }) => {
        if (!this._posts.has(postId)) {
          throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
        }
        if (!body.trim()) {
          throw new WearStoreError('empty_comment', 'Comment body must not be empty.');
        }
        if (parentCommentId && !this._comments.has(parentCommentId)) {
          throw new WearStoreError(
            'parent_comment_not_found',
            `Unknown parent comment ${parentCommentId}.`,
          );
        }
        const comment: Comment = {
          id: this._id('cmt'),
          postId,
          authorId,
          parentCommentId: parentCommentId ?? null,
          body,
          createdAt: this._now().toISOString(),
        };
        this._comments.set(comment.id, comment);
        return comment;
      },
      listForPost: async (postId) =>
        [...this._comments.values()]
          .filter((c) => c.postId === postId)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      authoredBy: async (userId) =>
        [...this._comments.values()]
          .filter((c) => c.authorId === userId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      commentsForPostCount: async (postId) => {
        let n = 0;
        for (const c of this._comments.values()) if (c.postId === postId) n += 1;
        return n;
      },
    };

    this.saves = {
      getOrCreateDefault: async (ownerId) => this._getOrCreateDefaultCollection(ownerId),
      listForOwner: async (ownerId) =>
        [...this._saveCollections.values()]
          .filter((c) => c.ownerId === ownerId)
          .map((c) => this._snapshotCollection(c)),
      savePost: async (ownerId, postId, collectionId) => {
        if (!this._posts.has(postId)) {
          throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
        }
        const collection = collectionId
          ? this._saveCollections.get(collectionId)
          : await this._getOrCreateDefaultCollection(ownerId);
        if (!collection) {
          throw new WearStoreError('collection_not_found', `Unknown collection ${collectionId}.`);
        }
        if (collection.ownerId !== ownerId) {
          throw new WearStoreError('forbidden', 'Collection does not belong to caller.');
        }
        this._savedPosts.add(`${collection.id}:${postId}`);
        return this._snapshotCollection(collection);
      },
      unsavePost: async (ownerId, postId, collectionId) => {
        if (collectionId) {
          const coll = this._saveCollections.get(collectionId);
          if (!coll || coll.ownerId !== ownerId) return;
          this._savedPosts.delete(`${collectionId}:${postId}`);
          return;
        }
        for (const c of this._saveCollections.values()) {
          if (c.ownerId === ownerId) this._savedPosts.delete(`${c.id}:${postId}`);
        }
      },
      isSaved: async (ownerId, postId) => {
        for (const c of this._saveCollections.values()) {
          if (c.ownerId === ownerId && this._savedPosts.has(`${c.id}:${postId}`)) return true;
        }
        return false;
      },
    };
  }

  private _id(prefix: string): string {
    const n = this._nextId++;
    return `${prefix}_${String(n).padStart(6, '0')}`;
  }

  private _readPost(id: string): PostWithMedia | null {
    const post = this._posts.get(id);
    if (!post) return null;
    const media = [...(this._postMedia.get(id) ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
    return { post, media };
  }

  private _paginate(
    posts: readonly Post[],
    params: FeedPageParams | undefined,
    alreadySorted = false,
  ): FeedPage {
    const limit = Math.max(1, Math.min(50, params?.limit ?? 20));
    const sorted = alreadySorted
      ? [...posts]
      : [...posts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const start = params?.cursor ? Number.parseInt(params.cursor, 10) : 0;
    if (Number.isNaN(start) || start < 0) {
      throw new WearStoreError('invalid_cursor', `Invalid cursor: ${params?.cursor ?? ''}`);
    }
    const slice = sorted.slice(start, start + limit);
    const nextIndex = start + slice.length;
    return {
      items: slice.map((p) => ({
        post: p,
        media: [...(this._postMedia.get(p.id) ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
      })),
      nextCursor: nextIndex < sorted.length ? String(nextIndex) : null,
    };
  }

  private async _getOrCreateDefaultCollection(ownerId: ConnectId): Promise<SaveCollection> {
    for (const c of this._saveCollections.values()) {
      if (c.ownerId === ownerId && c.name === 'default') {
        return this._snapshotCollection(c);
      }
    }
    const created: SaveCollection = {
      id: this._id('col'),
      ownerId,
      name: 'default',
      createdAt: this._now().toISOString(),
      postIds: [],
    };
    this._saveCollections.set(created.id, created);
    return this._snapshotCollection(created);
  }

  private _snapshotCollection(c: SaveCollection): SaveCollection {
    const postIds: string[] = [];
    for (const key of this._savedPosts) {
      const [collId, postId] = key.split(':', 2);
      if (collId === c.id && postId) postIds.push(postId);
    }
    return { ...c, postIds };
  }
}

function edgeKey(actorId: ConnectId, targetId: ConnectId): string {
  return `${actorId}->${targetId}`;
}
