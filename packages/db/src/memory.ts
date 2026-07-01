import type {
  BlockEdge,
  BlockRepo,
  BrandRepo,
  Comment,
  CommentLikeEdge,
  CommentRepo,
  ConnectId,
  Conversation,
  ConversationMember,
  ConversationRepo,
  ConversationRequestState,
  ConversationSummary,
  FeedPage,
  FeedPageParams,
  FollowCounts,
  FollowEdge,
  FollowRepo,
  HighlightRepo,
  LikeEdge,
  LikeRepo,
  Message,
  MessageRepo,
  Page,
  PageParams,
  Post,
  PostMedia,
  PostRepo,
  PostWithMedia,
  Profile,
  ProfileRepo,
  Report,
  ReportRepo,
  SaveCollection,
  SaveRepo,
  SettingsRepo,
  Story,
  StoryHighlight,
  StoryReaction,
  StoryRepo,
  StoryTrayEntry,
  StoryView,
  TrendingHashtag,
  UserRepo,
  UserSettings,
  WearBrand,
  WearStore,
  WearUser,
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
  readonly seedUsers?: readonly WearUser[];
  readonly seedBrands?: readonly WearBrand[];
  readonly seedProfiles?: readonly Profile[];
  readonly seedFollows?: readonly FollowEdge[];
  readonly seedSettings?: readonly UserSettings[];
  readonly seedPosts?: readonly PostWithMedia[];
  readonly seedLikes?: readonly LikeEdge[];
  readonly seedComments?: readonly Comment[];
  readonly seedStories?: readonly Story[];
  readonly seedConversations?: readonly {
    readonly conversation: Conversation;
    readonly members: readonly ConversationMember[];
    readonly messages?: readonly Message[];
  }[];
  readonly seedBlocks?: readonly BlockEdge[];
}

export class MemoryWearStore implements WearStore {
  public readonly users: UserRepo;
  public readonly brands: BrandRepo;
  public readonly profiles: ProfileRepo;
  public readonly follows: FollowRepo;
  public readonly settings: SettingsRepo;
  public readonly posts: PostRepo;
  public readonly likes: LikeRepo;
  public readonly comments: CommentRepo;
  public readonly saves: SaveRepo;
  public readonly stories: StoryRepo;
  public readonly highlights: HighlightRepo;
  public readonly conversations: ConversationRepo;
  public readonly messages: MessageRepo;
  public readonly blocks: BlockRepo;
  public readonly reports: ReportRepo;

  private readonly _now: () => Date;
  private readonly _users = new Map<ConnectId, WearUser>();
  private readonly _brands = new Map<ConnectId, WearBrand>();
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
  // Phase 6 — stories
  private readonly _stories = new Map<string, Story>();
  /** Keyed by `${storyId}:${viewerId}`. */
  private readonly _storyViews = new Map<string, StoryView>();
  private readonly _storyReactions = new Map<string, StoryReaction>();
  private readonly _highlights = new Map<string, StoryHighlight>();
  // Phase 6 — direct messages
  private readonly _conversations = new Map<string, Conversation>();
  /** Keyed by `${conversationId}:${userId}`. */
  private readonly _convMembers = new Map<string, ConversationMember>();
  private readonly _messages = new Map<string, Message>();
  // Phase 6 — moderation
  /** Keyed by `${actorId}->${targetId}`. */
  private readonly _blocks = new Map<string, BlockEdge>();
  private readonly _reports = new Map<string, Report>();
  private _nextId = 1;

  public constructor(options: MemoryWearStoreOptions = {}) {
    this._now = options.now ?? (() => new Date());

    for (const u of options.seedUsers ?? []) {
      this._users.set(u.id, u);
    }
    for (const b of options.seedBrands ?? []) {
      this._brands.set(b.id, b);
    }
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
    for (const s of options.seedStories ?? []) {
      this._stories.set(s.id, s);
    }
    for (const cv of options.seedConversations ?? []) {
      this._conversations.set(cv.conversation.id, cv.conversation);
      for (const m of cv.members) {
        this._convMembers.set(memberKey(m.conversationId, m.userId), m);
      }
      for (const msg of cv.messages ?? []) {
        this._messages.set(msg.id, msg);
      }
    }
    for (const b of options.seedBlocks ?? []) {
      this._blocks.set(edgeKey(b.actorId, b.targetId), b);
    }

    this.users = {
      getById: async (id) => this._users.get(id) ?? null,
      getByHandle: async (handle) => {
        const needle = handle.trim().toLowerCase();
        for (const u of this._users.values()) {
          if (u.handle.toLowerCase() === needle) return u;
        }
        return null;
      },
      search: async (query, params) => {
        const q = query.trim().toLowerCase();
        const all = [...this._users.values()].sort((a, b) => a.handle.localeCompare(b.handle));
        const matches = q
          ? all.filter(
              (u) =>
                u.handle.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
            )
          : all;
        return paginateList(matches, params);
      },
      upsertFromSession: async (input) => {
        const ts = this._now().toISOString();
        const existing = this._users.get(input.id);
        if (existing) {
          const next: WearUser = {
            ...existing,
            displayName: input.displayName,
            avatarUrl: input.avatarUrl ?? null,
            updatedAt: ts,
          };
          this._users.set(input.id, next);
          return next;
        }
        const handle = this._uniqueHandle(input.handle, input.id);
        const created: WearUser = {
          id: input.id,
          handle,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl ?? null,
          createdAt: ts,
          updatedAt: ts,
        };
        this._users.set(input.id, created);
        return created;
      },
    };

    this.brands = {
      getById: async (id) => this._brands.get(id) ?? null,
      getBySlug: async (slug) => {
        const needle = slug.trim().toLowerCase();
        for (const b of this._brands.values()) {
          if (b.slug.toLowerCase() === needle) return b;
        }
        return null;
      },
      listAll: async (params) => {
        const all = [...this._brands.values()].sort(
          (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
        );
        return paginateList(all, params);
      },
      listForOwner: async (ownerId) =>
        [...this._brands.values()]
          .filter((b) => b.ownerUserId === ownerId)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      search: async (query, params) => {
        const q = query.trim().toLowerCase();
        const all = [...this._brands.values()].sort((a, b) => a.name.localeCompare(b.name));
        const matches = q
          ? all.filter(
              (b) =>
                b.name.toLowerCase().includes(q) ||
                b.slug.toLowerCase().includes(q) ||
                (b.tagline ?? '').toLowerCase().includes(q),
            )
          : all;
        return paginateList(matches, params);
      },
      create: async (input) => {
        const slug = input.slug.trim().toLowerCase();
        if (!slug) {
          throw new WearStoreError('invalid_slug', 'Brand slug must not be empty.');
        }
        for (const b of this._brands.values()) {
          if (b.slug.toLowerCase() === slug) {
            throw new WearStoreError('slug_taken', `Brand slug ${slug} is already in use.`);
          }
        }
        const ts = this._now().toISOString();
        const created: WearBrand = {
          id: this._id('brd'),
          slug,
          name: input.name,
          tagline: input.tagline ?? null,
          websiteUrl: input.websiteUrl ?? null,
          logoUrl: input.logoUrl ?? null,
          verified: false,
          ownerUserId: input.ownerId,
          connectContributorId: input.connectContributorId ?? null,
          createdAt: ts,
          updatedAt: ts,
        };
        this._brands.set(created.id, created);
        return created;
      },
      update: async (brandId, ownerId, patch) => {
        const current = this._brands.get(brandId);
        if (!current) {
          throw new WearStoreError('brand_not_found', `Unknown brand ${brandId}.`);
        }
        if (current.ownerUserId !== ownerId) {
          throw new WearStoreError('forbidden', 'Only the owner can edit this brand.');
        }
        const next: WearBrand = {
          ...current,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.tagline !== undefined ? { tagline: patch.tagline } : {}),
          ...(patch.websiteUrl !== undefined ? { websiteUrl: patch.websiteUrl } : {}),
          ...(patch.logoUrl !== undefined ? { logoUrl: patch.logoUrl } : {}),
          ...(patch.connectContributorId !== undefined
            ? { connectContributorId: patch.connectContributorId }
            : {}),
          updatedAt: this._now().toISOString(),
        };
        this._brands.set(brandId, next);
        return next;
      },
    };

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

    // ─────────────────────────────────────────────────────────────────────
    // Phase 6 — stories
    // ─────────────────────────────────────────────────────────────────────
    const DEFAULT_STORY_TTL_MS = 1000 * 60 * 60 * 24;

    this.stories = {
      create: async (input) => {
        const createdAt = this._now();
        const ttl = Math.max(1000, input.ttlMs ?? DEFAULT_STORY_TTL_MS);
        const expiresAt = new Date(createdAt.getTime() + ttl);
        const story: Story = {
          id: this._id('sty'),
          authorId: input.authorId,
          brandId: input.brandId ?? null,
          mediaUrl: input.mediaUrl ?? null,
          mediaKind: input.mediaKind ?? 'image',
          caption: (input.caption ?? '').trim() || null,
          audience: input.audience ?? 'public',
          createdAt: createdAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        };
        if (story.mediaKind === 'text' && !story.caption) {
          throw new WearStoreError('empty_story', 'Text stories must have a caption.');
        }
        if (story.mediaKind !== 'text' && !story.mediaUrl) {
          throw new WearStoreError('empty_story', 'Image/video stories must have a media url.');
        }
        this._stories.set(story.id, story);
        return story;
      },
      getById: async (id) => this._stories.get(id) ?? null,
      listByAuthor: async (authorId) =>
        [...this._stories.values()]
          .filter((s) => s.authorId === authorId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      listActiveForViewer: async (viewerId) => {
        const nowMs = this._now().getTime();
        const followingTargets = new Set<ConnectId>();
        for (const edge of this._follows.values()) {
          if (edge.actorId === viewerId) followingTargets.add(edge.targetId);
        }
        return [...this._stories.values()]
          .filter((s) => Date.parse(s.expiresAt) > nowMs)
          .filter((s) => !this._isBlockedEither(viewerId, s.authorId))
          .filter((s) => {
            if (s.authorId === viewerId) return true;
            if (s.audience === 'public') return true;
            return followingTargets.has(s.authorId);
          })
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      },
      trayForViewer: async (viewerId) => {
        const active = await this.stories.listActiveForViewer(viewerId);
        const grouped = new Map<ConnectId, Story[]>();
        for (const s of active) {
          const list = grouped.get(s.authorId) ?? [];
          list.push(s);
          grouped.set(s.authorId, list);
        }
        const entries: StoryTrayEntry[] = [];
        for (const [authorId, list] of grouped.entries()) {
          // Already sorted newest-first by listActiveForViewer.
          const latest = list[0]!;
          const hasUnseen = list.some(
            (s) => !this._storyViews.has(`${s.id}:${viewerId}`) && s.authorId !== viewerId,
          );
          entries.push({
            authorId,
            latestStoryId: latest.id,
            latestCreatedAt: latest.createdAt,
            storyCount: list.length,
            hasUnseen,
          });
        }
        // Viewer's own tray entry first, then unseen, then the rest by recency.
        return entries.sort((a, b) => {
          if (a.authorId === viewerId) return -1;
          if (b.authorId === viewerId) return 1;
          if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
          return Date.parse(b.latestCreatedAt) - Date.parse(a.latestCreatedAt);
        });
      },
      recordView: async (storyId, viewerId) => {
        const story = this._stories.get(storyId);
        if (!story) {
          throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        }
        if (story.authorId === viewerId) {
          // Authors don't show up in their own viewer list, but we still
          // return a synthetic view so callers don't have to special-case.
          return { storyId, viewerId, viewedAt: this._now().toISOString() };
        }
        const key = `${storyId}:${viewerId}`;
        const existing = this._storyViews.get(key);
        if (existing) return existing;
        const view: StoryView = {
          storyId,
          viewerId,
          viewedAt: this._now().toISOString(),
        };
        this._storyViews.set(key, view);
        return view;
      },
      listViewers: async (storyId, callerId) => {
        const story = this._stories.get(storyId);
        if (!story) return [];
        if (story.authorId !== callerId) {
          throw new WearStoreError('forbidden', 'Only the author can see story viewers.');
        }
        return [...this._storyViews.values()]
          .filter((v) => v.storyId === storyId)
          .sort((a, b) => Date.parse(b.viewedAt) - Date.parse(a.viewedAt));
      },
      addReaction: async ({ storyId, userId, kind }) => {
        const story = this._stories.get(storyId);
        if (!story) {
          throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        }
        if (this._isBlockedEither(userId, story.authorId)) {
          throw new WearStoreError('forbidden', 'Cannot react to this story.');
        }
        const reaction: StoryReaction = {
          id: this._id('rxn'),
          storyId,
          userId,
          kind,
          createdAt: this._now().toISOString(),
        };
        this._storyReactions.set(reaction.id, reaction);
        return reaction;
      },
      listReactions: async (storyId) =>
        [...this._storyReactions.values()]
          .filter((r) => r.storyId === storyId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      delete: async (storyId, authorId) => {
        const s = this._stories.get(storyId);
        if (!s) return;
        if (s.authorId !== authorId) {
          throw new WearStoreError('forbidden', 'Only the author can delete this story.');
        }
        this._stories.delete(storyId);
        for (const key of [...this._storyViews.keys()]) {
          if (key.startsWith(`${storyId}:`)) this._storyViews.delete(key);
        }
        for (const [id, r] of [...this._storyReactions.entries()]) {
          if (r.storyId === storyId) this._storyReactions.delete(id);
        }
        for (const [id, h] of [...this._highlights.entries()]) {
          if (h.storyIds.includes(storyId)) {
            this._highlights.set(id, {
              ...h,
              storyIds: h.storyIds.filter((sid) => sid !== storyId),
            });
          }
        }
      },
    };

    this.highlights = {
      create: async ({ ownerId, name, coverUrl }) => {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new WearStoreError('empty_highlight', 'Highlight name must not be empty.');
        }
        const created: StoryHighlight = {
          id: this._id('hlt'),
          ownerId,
          name: trimmed.slice(0, 80),
          coverUrl: coverUrl ?? null,
          createdAt: this._now().toISOString(),
          storyIds: [],
        };
        this._highlights.set(created.id, created);
        return created;
      },
      listForOwner: async (ownerId) =>
        [...this._highlights.values()]
          .filter((h) => h.ownerId === ownerId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      getById: async (id) => this._highlights.get(id) ?? null,
      addStory: async (highlightId, storyId, ownerId) => {
        const highlight = this._requireOwnedHighlight(highlightId, ownerId);
        const story = this._stories.get(storyId);
        if (!story) {
          throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        }
        if (story.authorId !== ownerId) {
          throw new WearStoreError(
            'forbidden',
            'Highlights may only contain the owner’s own stories.',
          );
        }
        if (highlight.storyIds.includes(storyId)) return highlight;
        const next: StoryHighlight = {
          ...highlight,
          storyIds: [...highlight.storyIds, storyId],
        };
        this._highlights.set(highlightId, next);
        return next;
      },
      removeStory: async (highlightId, storyId, ownerId) => {
        const highlight = this._requireOwnedHighlight(highlightId, ownerId);
        const next: StoryHighlight = {
          ...highlight,
          storyIds: highlight.storyIds.filter((s) => s !== storyId),
        };
        this._highlights.set(highlightId, next);
        return next;
      },
      delete: async (highlightId, ownerId) => {
        this._requireOwnedHighlight(highlightId, ownerId);
        this._highlights.delete(highlightId);
      },
    };

    // ─────────────────────────────────────────────────────────────────────
    // Phase 6 — direct messages
    // ─────────────────────────────────────────────────────────────────────
    this.conversations = {
      getOrCreateDirect: async (actorId, otherId) => {
        if (actorId === otherId) {
          throw new WearStoreError('self_dm', 'Cannot start a DM with yourself.');
        }
        if (this._isBlockedEither(actorId, otherId)) {
          throw new WearStoreError('forbidden', 'Cannot start a DM with this user.');
        }
        const wantPair = [actorId, otherId].sort();
        for (const conv of this._conversations.values()) {
          if (conv.kind !== 'direct') continue;
          const members = [...this._convMembers.values()].filter(
            (m) => m.conversationId === conv.id,
          );
          if (members.length !== 2) continue;
          const ids = members.map((m) => m.userId).sort();
          if (ids[0] === wantPair[0] && ids[1] === wantPair[1]) {
            return conv;
          }
        }
        const followsOtherToActor = this._follows.has(edgeKey(otherId, actorId));
        // The initiator is always accepted on their own side. The recipient
        // is auto-accepted only if they already follow the sender — otherwise
        // the conversation lands in their requests inbox.
        const recipientRequestState: ConversationRequestState = followsOtherToActor
          ? 'accepted'
          : 'requested';
        const ts = this._now().toISOString();
        const conv: Conversation = {
          id: this._id('cnv'),
          kind: 'direct',
          name: null,
          createdById: actorId,
          createdAt: ts,
          updatedAt: ts,
        };
        this._conversations.set(conv.id, conv);
        this._convMembers.set(memberKey(conv.id, actorId), {
          conversationId: conv.id,
          userId: actorId,
          joinedAt: ts,
          lastReadAt: ts,
          mutedUntil: null,
          requestState: 'accepted',
          role: 'owner',
        });
        this._convMembers.set(memberKey(conv.id, otherId), {
          conversationId: conv.id,
          userId: otherId,
          joinedAt: ts,
          lastReadAt: null,
          mutedUntil: null,
          requestState: recipientRequestState,
          role: 'member',
        });
        return conv;
      },
      createGroup: async ({ createdById, name, memberIds }) => {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new WearStoreError('empty_group_name', 'Group name must not be empty.');
        }
        const unique = Array.from(new Set([createdById, ...memberIds])).filter(
          (id) => !this._isBlockedEither(createdById, id),
        );
        if (unique.length < 2) {
          throw new WearStoreError('group_too_small', 'A group needs at least two members.');
        }
        const ts = this._now().toISOString();
        const conv: Conversation = {
          id: this._id('cnv'),
          kind: 'group',
          name: trimmed.slice(0, 80),
          createdById,
          createdAt: ts,
          updatedAt: ts,
        };
        this._conversations.set(conv.id, conv);
        for (const userId of unique) {
          this._convMembers.set(memberKey(conv.id, userId), {
            conversationId: conv.id,
            userId,
            joinedAt: ts,
            lastReadAt: userId === createdById ? ts : null,
            mutedUntil: null,
            requestState: 'accepted',
            role: userId === createdById ? 'owner' : 'member',
          });
        }
        return conv;
      },
      getById: async (id, callerId) => {
        const conv = this._conversations.get(id);
        if (!conv) return null;
        if (!this._convMembers.has(memberKey(id, callerId))) return null;
        return conv;
      },
      membership: async (conversationId, userId) =>
        this._convMembers.get(memberKey(conversationId, userId)) ?? null,
      listMembers: async (conversationId) =>
        [...this._convMembers.values()].filter((m) => m.conversationId === conversationId),
      listForUser: async (userId, options) => {
        const wantState = options?.requestState;
        const summaries: ConversationSummary[] = [];
        for (const conv of this._conversations.values()) {
          const me = this._convMembers.get(memberKey(conv.id, userId));
          if (!me) continue;
          if (wantState && me.requestState !== wantState) continue;
          const members = [...this._convMembers.values()].filter(
            (m) => m.conversationId === conv.id,
          );
          const messages = [...this._messages.values()]
            .filter((m) => m.conversationId === conv.id)
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
          const lastMessage = messages.length ? messages[messages.length - 1]! : null;
          const lastReadMs = me.lastReadAt ? Date.parse(me.lastReadAt) : 0;
          const unreadCount = messages.filter(
            (m) => m.authorId !== userId && !m.deletedAt && Date.parse(m.createdAt) > lastReadMs,
          ).length;
          summaries.push({ conversation: conv, members, lastMessage, unreadCount });
        }
        return summaries.sort((a, b) => {
          const aTs = a.lastMessage?.createdAt ?? a.conversation.updatedAt;
          const bTs = b.lastMessage?.createdAt ?? b.conversation.updatedAt;
          return Date.parse(bTs) - Date.parse(aTs);
        });
      },
      markRead: async (conversationId, userId) => {
        const key = memberKey(conversationId, userId);
        const member = this._convMembers.get(key);
        if (!member) return;
        this._convMembers.set(key, { ...member, lastReadAt: this._now().toISOString() });
      },
      acceptRequest: async (conversationId, userId) => {
        const key = memberKey(conversationId, userId);
        const member = this._convMembers.get(key);
        if (!member) {
          throw new WearStoreError('not_a_member', 'No membership found.');
        }
        const next: ConversationMember = { ...member, requestState: 'accepted' };
        this._convMembers.set(key, next);
        return next;
      },
      declineRequest: async (conversationId, userId) => {
        const key = memberKey(conversationId, userId);
        const member = this._convMembers.get(key);
        if (!member) return;
        // Decline = leave the conversation.
        this._convMembers.delete(key);
      },
      setMuted: async (conversationId, userId, mutedUntil) => {
        const key = memberKey(conversationId, userId);
        const member = this._convMembers.get(key);
        if (!member) {
          throw new WearStoreError('not_a_member', 'No membership found.');
        }
        const next: ConversationMember = { ...member, mutedUntil };
        this._convMembers.set(key, next);
        return next;
      },
      leave: async (conversationId, userId) => {
        this._convMembers.delete(memberKey(conversationId, userId));
      },
    };

    this.messages = {
      send: async ({ conversationId, authorId, body }) => {
        const conv = this._conversations.get(conversationId);
        if (!conv) {
          throw new WearStoreError('conversation_not_found', `Unknown ${conversationId}.`);
        }
        const me = this._convMembers.get(memberKey(conversationId, authorId));
        if (!me) {
          throw new WearStoreError('forbidden', 'Not a member of this conversation.');
        }
        if (me.requestState !== 'accepted' && conv.createdById !== authorId) {
          throw new WearStoreError('request_pending', 'Accept the request before replying.');
        }
        const trimmed = body.trim();
        if (!trimmed) {
          throw new WearStoreError('empty_message', 'Message body must not be empty.');
        }
        // Sanity-check blocks against every other member (1:1 or group).
        for (const m of this._convMembers.values()) {
          if (m.conversationId !== conversationId || m.userId === authorId) continue;
          if (this._isBlockedEither(authorId, m.userId)) {
            throw new WearStoreError('forbidden', 'Cannot message a user you have blocked.');
          }
        }
        const ts = this._now().toISOString();
        const message: Message = {
          id: this._id('msg'),
          conversationId,
          authorId,
          body: trimmed.slice(0, 4000),
          createdAt: ts,
          deletedAt: null,
        };
        this._messages.set(message.id, message);
        this._conversations.set(conversationId, { ...conv, updatedAt: ts });
        return message;
      },
      list: async (conversationId, callerId, params) => {
        const member = this._convMembers.get(memberKey(conversationId, callerId));
        if (!member) {
          throw new WearStoreError('forbidden', 'Not a member of this conversation.');
        }
        const all = [...this._messages.values()]
          .filter((m) => m.conversationId === conversationId)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        const limit = Math.max(1, Math.min(100, params?.limit ?? 50));
        const start = params?.cursor ? Number.parseInt(params.cursor, 10) : 0;
        if (Number.isNaN(start) || start < 0) {
          throw new WearStoreError('invalid_cursor', `Invalid cursor: ${params?.cursor ?? ''}`);
        }
        const slice = all.slice(start, start + limit);
        const nextIndex = start + slice.length;
        return {
          items: slice,
          nextCursor: nextIndex < all.length ? String(nextIndex) : null,
        };
      },
      deleteOwn: async (messageId, callerId) => {
        const m = this._messages.get(messageId);
        if (!m) return;
        if (m.authorId !== callerId) {
          throw new WearStoreError('forbidden', 'Only the author can delete this message.');
        }
        this._messages.set(messageId, { ...m, deletedAt: this._now().toISOString(), body: '' });
      },
    };

    this.blocks = {
      block: async (actorId, targetId) => {
        if (actorId === targetId) {
          throw new WearStoreError('self_block', 'A user cannot block themselves.');
        }
        const key = edgeKey(actorId, targetId);
        const existing = this._blocks.get(key);
        if (existing) return existing;
        const edge: BlockEdge = {
          actorId,
          targetId,
          createdAt: this._now().toISOString(),
        };
        this._blocks.set(key, edge);
        // Blocking implies unfollowing in both directions.
        this._follows.delete(edgeKey(actorId, targetId));
        this._follows.delete(edgeKey(targetId, actorId));
        return edge;
      },
      unblock: async (actorId, targetId) => {
        this._blocks.delete(edgeKey(actorId, targetId));
      },
      isBlockedEither: async (a, b) => this._isBlockedEither(a, b),
      listBlocked: async (actorId) =>
        [...this._blocks.values()].filter((b) => b.actorId === actorId),
    };

    this.reports = {
      create: async ({ reporterId, subjectKind, subjectId, reason, note }) => {
        const report: Report = {
          id: this._id('rep'),
          reporterId,
          subjectKind,
          subjectId,
          reason,
          note: (note ?? '').trim() ? note!.trim().slice(0, 2000) : null,
          createdAt: this._now().toISOString(),
        };
        this._reports.set(report.id, report);
        return report;
      },
      listForSubject: async (subjectKind, subjectId) =>
        [...this._reports.values()]
          .filter((r) => r.subjectKind === subjectKind && r.subjectId === subjectId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      listByReporter: async (reporterId) =>
        [...this._reports.values()]
          .filter((r) => r.reporterId === reporterId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    };
  }

  private _isBlockedEither(a: ConnectId, b: ConnectId): boolean {
    return this._blocks.has(edgeKey(a, b)) || this._blocks.has(edgeKey(b, a));
  }

  /**
   * Resolve a globally-unique handle for a new mirror row. Starts from the
   * caller's preferred handle (already sanitised upstream) and suffixes
   * `-2`, `-3`, … until free. Empty input falls back to `user_<id-prefix>`.
   * Mirrors the retry-on-unique-violation behaviour of `SupabaseWearStore`.
   */
  private _uniqueHandle(preferred: string, id: ConnectId): string {
    const base = preferred.trim().toLowerCase() || `user_${id.slice(0, 8)}`;
    const taken = new Set<string>();
    for (const u of this._users.values()) taken.add(u.handle.toLowerCase());
    if (!taken.has(base)) return base;
    for (let n = 2; ; n += 1) {
      const candidate = `${base}-${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  private _requireOwnedHighlight(highlightId: string, ownerId: ConnectId): StoryHighlight {
    const highlight = this._highlights.get(highlightId);
    if (!highlight) {
      throw new WearStoreError('highlight_not_found', `Unknown highlight ${highlightId}.`);
    }
    if (highlight.ownerId !== ownerId) {
      throw new WearStoreError('forbidden', 'Only the owner can modify this highlight.');
    }
    return highlight;
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

/**
 * Cursor pagination for the directory repos (users/brands). The cursor is the
 * numeric offset, matching the feed `_paginate` and the connect-client mock so
 * callers see one consistent pagination contract.
 */
function paginateList<T>(items: readonly T[], params?: PageParams): Page<T> {
  const limit = Math.max(1, Math.min(100, params?.limit ?? 20));
  const start = params?.cursor ? Number.parseInt(params.cursor, 10) : 0;
  if (Number.isNaN(start) || start < 0) {
    throw new WearStoreError('invalid_cursor', `Invalid cursor: ${params?.cursor ?? ''}`);
  }
  const slice = items.slice(start, start + limit);
  const nextIndex = start + slice.length;
  return {
    items: slice,
    nextCursor: nextIndex < items.length ? String(nextIndex) : null,
  };
}

function edgeKey(actorId: ConnectId, targetId: ConnectId): string {
  return `${actorId}->${targetId}`;
}

function memberKey(conversationId: string, userId: ConnectId): string {
  return `${conversationId}:${userId}`;
}
