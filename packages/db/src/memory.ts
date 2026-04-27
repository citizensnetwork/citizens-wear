import type {
  BrandFollow,
  BrandFollowCounts,
  BrandFollowRepo,
  CartItem,
  CartRepo,
  CommentRepo,
  CreateCommentInput,
  ConnectId,
  FeedParams,
  FollowCounts,
  FollowEdge,
  FollowRepo,
  ModerationItem,
  ModerationRepo,
  OpenModerationItemInput,
  Post,
  PostComment,
  PostEngagementRepo,
  PostLike,
  PostListParams,
  PostMedia,
  PostProductTag,
  PostRepo,
  PostStatus,
  Profile,
  ProfileRepo,
  SaveRepo,
  SavedPost,
  SettingsRepo,
  UserSettings,
  WearPage,
  WearPageParams,
  WearStore,
} from './contract';
import { hasTrustedPostListAccess, WearStoreError } from './contract';

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
  readonly seedPosts?: readonly Post[];
  readonly seedPostMedia?: readonly PostMedia[];
  readonly seedPostProductTags?: readonly PostProductTag[];
  readonly seedPostLikes?: readonly PostLike[];
  readonly seedComments?: readonly PostComment[];
  readonly seedSavedPosts?: readonly SavedPost[];
  readonly seedCartItems?: readonly CartItem[];
  readonly seedBrandFollows?: readonly BrandFollow[];
  readonly seedModerationItems?: readonly ModerationItem[];
}

export class MemoryWearStore implements WearStore {
  public readonly profiles: ProfileRepo;
  public readonly follows: FollowRepo;
  public readonly settings: SettingsRepo;
  public readonly posts: PostRepo;
  public readonly postEngagement: PostEngagementRepo;
  public readonly comments: CommentRepo;
  public readonly saves: SaveRepo;
  public readonly cart: CartRepo;
  public readonly brandFollows: BrandFollowRepo;
  public readonly moderation: ModerationRepo;

  private readonly _now: () => Date;
  private readonly _profiles = new Map<ConnectId, Profile>();
  private readonly _settings = new Map<ConnectId, UserSettings>();
  /** Keyed by `${actorId}->${targetId}`. */
  private readonly _follows = new Map<string, FollowEdge>();
  private readonly _posts = new Map<string, Post>();
  private readonly _postMedia = new Map<string, PostMedia>();
  private readonly _postProductTags = new Map<string, PostProductTag>();
  private readonly _postLikes = new Map<string, PostLike>();
  private readonly _comments = new Map<string, PostComment>();
  private readonly _savedPosts = new Map<string, SavedPost>();
  private readonly _cartItems = new Map<string, CartItem>();
  private readonly _brandFollows = new Map<string, BrandFollow>();
  private readonly _moderationItems = new Map<string, ModerationItem>();

  private _postSequence = 1;
  private _mediaSequence = 1;
  private _commentSequence = 1;
  private _cartSequence = 1;
  private _moderationSequence = 1;

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
    for (const post of options.seedPosts ?? []) {
      this._posts.set(post.id, post);
    }
    for (const media of options.seedPostMedia ?? []) {
      this._postMedia.set(media.id, media);
    }
    for (const tag of options.seedPostProductTags ?? []) {
      this._postProductTags.set(productTagKey(tag.postId, tag.productId), tag);
    }
    for (const like of options.seedPostLikes ?? []) {
      this._postLikes.set(postLikeKey(like.actorUserId, like.postId), like);
    }
    for (const comment of options.seedComments ?? []) {
      this._comments.set(comment.id, comment);
    }
    for (const savedPost of options.seedSavedPosts ?? []) {
      this._savedPosts.set(savedPostKey(savedPost.userId, savedPost.postId), savedPost);
    }
    for (const item of options.seedCartItems ?? []) {
      this._cartItems.set(item.id, item);
    }
    for (const follow of options.seedBrandFollows ?? []) {
      this._brandFollows.set(brandFollowKey(follow.userId, follow.brandId), follow);
    }
    for (const item of options.seedModerationItems ?? []) {
      this._moderationItems.set(item.id, item);
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
      create: async (input) => {
        const caption = input.caption.trim();
        if (caption.length === 0) {
          throw new WearStoreError('invalid_post', 'Post caption cannot be empty.');
        }

        const now = this.nowIso();
        const status = input.status ?? 'published';
        const publishedAt =
          input.publishedAt !== undefined ? input.publishedAt : status === 'published' ? now : null;
        const brandId = input.brandId ?? null;
        const authorKind = brandId ? 'brand' : 'citizen';
        const requestedAuthorKind = (input as { readonly authorKind?: Post['authorKind'] })
          .authorKind;
        if (requestedAuthorKind !== undefined && requestedAuthorKind !== authorKind) {
          throw new WearStoreError(
            'invalid_post_author',
            'Brand posts must include a brand id and citizen posts must not include one.',
          );
        }
        const post: Post = {
          id: this.nextPostId(),
          authorUserId: input.authorUserId,
          authorKind,
          brandId,
          caption,
          status,
          visibility: input.visibility ?? 'public',
          createdAt: now,
          updatedAt: now,
          publishedAt,
        };
        this._posts.set(post.id, post);

        for (const [index, media] of (input.media ?? []).entries()) {
          const created: PostMedia = {
            id: this.nextMediaId(),
            postId: post.id,
            url: media.url,
            altText: media.altText,
            sortOrder: media.sortOrder ?? index,
          };
          this._postMedia.set(created.id, created);
        }

        for (const [index, tag] of (input.productTags ?? []).entries()) {
          const created: PostProductTag = {
            postId: post.id,
            productId: tag.productId,
            sortOrder: tag.sortOrder ?? index,
          };
          this._postProductTags.set(productTagKey(created.postId, created.productId), created);
        }

        return post;
      },
      get: async (postId) => this._posts.get(postId) ?? null,
      update: async (postId, patch) => {
        const current = this.requirePost(postId);
        const nextStatus = patch.status ?? current.status;
        const nextPublishedAt =
          patch.publishedAt !== undefined
            ? patch.publishedAt
            : nextStatus === 'published' && current.publishedAt === null
              ? this.nowIso()
              : current.publishedAt;
        const next: Post = {
          ...current,
          ...patch,
          status: nextStatus,
          publishedAt: nextPublishedAt,
          updatedAt: this.nowIso(),
        };
        this._posts.set(postId, next);
        return next;
      },
      listFeed: async (params) => pagePosts(this.filteredFeedPosts(params), params),
      listForAuthor: async (authorUserId, params) =>
        pagePosts(
          this.filteredPosts(params).filter((post) => post.authorUserId === authorUserId),
          params,
        ),
      listForBrand: async (brandId, params) =>
        pagePosts(
          this.filteredPosts(params).filter((post) => post.brandId === brandId),
          params,
        ),
      listMedia: async (postId) =>
        [...this._postMedia.values()]
          .filter((media) => media.postId === postId)
          .sort((left, right) => left.sortOrder - right.sortOrder),
      listProductTags: async (postId) =>
        [...this._postProductTags.values()]
          .filter((tag) => tag.postId === postId)
          .sort((left, right) => left.sortOrder - right.sortOrder),
    };

    this.postEngagement = {
      like: async (actorUserId, postId) => {
        this.requireEngageablePost(postId, actorUserId);
        const key = postLikeKey(actorUserId, postId);
        const existing = this._postLikes.get(key);
        if (existing) return existing;
        const like: PostLike = {
          actorUserId,
          postId,
          createdAt: this.nowIso(),
        };
        this._postLikes.set(key, like);
        return like;
      },
      unlike: async (actorUserId, postId) => {
        this._postLikes.delete(postLikeKey(actorUserId, postId));
      },
      isLiked: async (actorUserId, postId) => this._postLikes.has(postLikeKey(actorUserId, postId)),
      likeCount: async (postId) =>
        [...this._postLikes.values()].filter((like) => like.postId === postId).length,
    };

    this.comments = {
      create: async (input) => this.createComment(input),
      get: async (commentId) => this._comments.get(commentId) ?? null,
      listForPost: async (postId, params) =>
        pageItems(
          [...this._comments.values()]
            .filter((comment) => comment.postId === postId && comment.status === 'visible')
            .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
          params,
        ),
      hide: async (commentId) => {
        const current = this._comments.get(commentId);
        if (!current) {
          throw new WearStoreError('not_found', `Comment ${commentId} does not exist.`);
        }
        const next: PostComment = {
          ...current,
          status: 'hidden',
          updatedAt: this.nowIso(),
        };
        this._comments.set(commentId, next);
        return next;
      },
    };

    this.saves = {
      save: async (userId, postId) => {
        this.requireEngageablePost(postId, userId);
        const key = savedPostKey(userId, postId);
        const existing = this._savedPosts.get(key);
        if (existing) return existing;
        const savedPost: SavedPost = {
          userId,
          postId,
          createdAt: this.nowIso(),
        };
        this._savedPosts.set(key, savedPost);
        return savedPost;
      },
      unsave: async (userId, postId) => {
        this._savedPosts.delete(savedPostKey(userId, postId));
      },
      isSaved: async (userId, postId) => this._savedPosts.has(savedPostKey(userId, postId)),
      listForUser: async (userId, params) =>
        pageItems(
          [...this._savedPosts.values()]
            .filter((savedPost) => savedPost.userId === userId)
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
          params,
        ),
    };

    this.cart = {
      addItem: async (userId, productId, quantity = 1) => {
        assertPositiveQuantity(quantity);
        const existing = this.findCartItem(userId, productId);
        if (existing) {
          const next: CartItem = {
            ...existing,
            quantity: existing.quantity + quantity,
            updatedAt: this.nowIso(),
          };
          this._cartItems.set(existing.id, next);
          return next;
        }

        const now = this.nowIso();
        const item: CartItem = {
          id: this.nextCartId(),
          userId,
          productId,
          quantity,
          createdAt: now,
          updatedAt: now,
        };
        this._cartItems.set(item.id, item);
        return item;
      },
      updateQuantity: async (userId, cartItemId, quantity) => {
        assertPositiveQuantity(quantity);
        const current = this.requireCartItem(userId, cartItemId);
        const next: CartItem = {
          ...current,
          quantity,
          updatedAt: this.nowIso(),
        };
        this._cartItems.set(cartItemId, next);
        return next;
      },
      removeItem: async (userId, cartItemId) => {
        this.requireCartItem(userId, cartItemId);
        this._cartItems.delete(cartItemId);
      },
      listForUser: async (userId) =>
        [...this._cartItems.values()]
          .filter((item) => item.userId === userId)
          .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
      countForUser: async (userId) =>
        [...this._cartItems.values()]
          .filter((item) => item.userId === userId)
          .reduce((total, item) => total + item.quantity, 0),
      clear: async (userId) => {
        for (const item of this._cartItems.values()) {
          if (item.userId === userId) {
            this._cartItems.delete(item.id);
          }
        }
      },
    };

    this.brandFollows = {
      follow: async (userId, brandId) => {
        const key = brandFollowKey(userId, brandId);
        const existing = this._brandFollows.get(key);
        if (existing) return existing;
        const follow: BrandFollow = {
          userId,
          brandId,
          createdAt: this.nowIso(),
        };
        this._brandFollows.set(key, follow);
        return follow;
      },
      unfollow: async (userId, brandId) => {
        this._brandFollows.delete(brandFollowKey(userId, brandId));
      },
      isFollowing: async (userId, brandId) =>
        this._brandFollows.has(brandFollowKey(userId, brandId)),
      counts: async (brandId): Promise<BrandFollowCounts> => ({
        followers: [...this._brandFollows.values()].filter((follow) => follow.brandId === brandId)
          .length,
      }),
      followers: async (brandId) =>
        [...this._brandFollows.values()].filter((follow) => follow.brandId === brandId),
      following: async (userId) =>
        [...this._brandFollows.values()].filter((follow) => follow.userId === userId),
    };

    this.moderation = {
      open: async (input) => this.openModerationItem(input),
      get: async (itemId) => this._moderationItems.get(itemId) ?? null,
      listQueue: async (params) =>
        pageItems(
          [...this._moderationItems.values()]
            .filter((item) => item.status === 'open')
            .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
          params,
        ),
      resolve: async (itemId, reviewerUserId, status, note = null) => {
        const current = this._moderationItems.get(itemId);
        if (!current) {
          throw new WearStoreError('not_found', `Moderation item ${itemId} does not exist.`);
        }
        if (current.status !== 'open') {
          throw new WearStoreError(
            'moderation_resolved',
            `Moderation item ${itemId} is already resolved.`,
          );
        }

        if (current.targetType === 'post') {
          await this.applyPostModeration(current.targetId, status);
        }
        if (current.targetType === 'comment') {
          await this.applyCommentModeration(current.targetId, status);
        }

        const next: ModerationItem = {
          ...current,
          status,
          note,
          reviewerUserId,
          updatedAt: this.nowIso(),
          resolvedAt: this.nowIso(),
        };
        this._moderationItems.set(itemId, next);
        return next;
      },
    };
  }

  private nowIso(): string {
    return this._now().toISOString();
  }

  private requirePost(postId: string): Post {
    const post = this._posts.get(postId);
    if (!post) {
      throw new WearStoreError('not_found', `Post ${postId} does not exist.`);
    }
    return post;
  }

  private requireEngageablePost(postId: string, actorUserId: ConnectId): Post {
    const post = this.requirePost(postId);
    if (post.status !== 'published' || !this.canReadPost(post, { viewerUserId: actorUserId })) {
      throw new WearStoreError(
        'forbidden',
        `Post ${postId} is not visible to user ${actorUserId}.`,
      );
    }
    return post;
  }

  private requireComment(commentId: string): PostComment {
    const comment = this._comments.get(commentId);
    if (!comment) {
      throw new WearStoreError('not_found', `Comment ${commentId} does not exist.`);
    }
    return comment;
  }

  private sortedPosts(): readonly Post[] {
    return [...this._posts.values()].sort((left, right) => {
      const rightTime = Date.parse(right.publishedAt ?? right.createdAt);
      const leftTime = Date.parse(left.publishedAt ?? left.createdAt);
      return rightTime - leftTime;
    });
  }

  private filteredFeedPosts(params?: FeedParams): readonly Post[] {
    return this.filteredPosts(params).filter((post) => {
      if (params?.authorUserId && post.authorUserId !== params.authorUserId) return false;
      if (params?.brandId && post.brandId !== params.brandId) return false;
      return true;
    });
  }

  private filteredPosts(params?: PostListParams): readonly Post[] {
    const status = params?.status ?? 'published';
    return this.sortedPosts().filter(
      (post) => post.status === status && this.canReadPost(post, params),
    );
  }

  private canReadPost(post: Post, params?: PostListParams): boolean {
    if (hasTrustedPostListAccess(params?.trustedAccess)) return true;
    const viewerUserId = params?.viewerUserId;

    if (post.status !== 'published') {
      return viewerUserId === post.authorUserId;
    }

    if (post.visibility === 'public') return true;
    if (!viewerUserId) return false;
    if (viewerUserId === post.authorUserId) return true;
    if (post.authorKind === 'brand' && post.brandId) {
      return this._brandFollows.has(brandFollowKey(viewerUserId, post.brandId));
    }
    return this._follows.has(edgeKey(viewerUserId, post.authorUserId));
  }

  private createComment(input: CreateCommentInput): PostComment {
    this.requireEngageablePost(input.postId, input.authorUserId);
    const body = input.body.trim();
    if (body.length === 0) {
      throw new WearStoreError('invalid_comment', 'Comment body cannot be empty.');
    }
    const now = this.nowIso();
    const comment: PostComment = {
      id: this.nextCommentId(),
      postId: input.postId,
      authorUserId: input.authorUserId,
      body,
      status: 'visible',
      createdAt: now,
      updatedAt: now,
    };
    this._comments.set(comment.id, comment);
    return comment;
  }

  private findCartItem(userId: ConnectId, productId: ConnectId): CartItem | null {
    return (
      [...this._cartItems.values()].find(
        (item) => item.userId === userId && item.productId === productId,
      ) ?? null
    );
  }

  private requireCartItem(userId: ConnectId, cartItemId: string): CartItem {
    const item = this._cartItems.get(cartItemId);
    if (!item) {
      throw new WearStoreError('not_found', `Cart item ${cartItemId} does not exist.`);
    }
    if (item.userId !== userId) {
      throw new WearStoreError(
        'forbidden',
        `Cart item ${cartItemId} does not belong to user ${userId}.`,
      );
    }
    return item;
  }

  private openModerationItem(input: OpenModerationItemInput): ModerationItem {
    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new WearStoreError('invalid_moderation_item', 'Moderation reason cannot be empty.');
    }
    if (input.targetType === 'post') {
      this.requirePost(input.targetId);
    }
    if (input.targetType === 'comment') {
      this.requireComment(input.targetId);
    }

    const now = this.nowIso();
    const item: ModerationItem = {
      id: this.nextModerationId(),
      targetType: input.targetType,
      targetId: input.targetId,
      reporterUserId: input.reporterUserId ?? null,
      status: 'open',
      reason,
      note: null,
      reviewerUserId: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    this._moderationItems.set(item.id, item);
    return item;
  }

  private async applyPostModeration(
    postId: string,
    status: Exclude<ModerationItem['status'], 'open'>,
  ): Promise<void> {
    const postStatusByDecision: Record<Exclude<ModerationItem['status'], 'open'>, PostStatus> = {
      approved: 'published',
      hidden: 'hidden',
      rejected: 'rejected',
    };
    await this.posts.update(postId, { status: postStatusByDecision[status] });
  }

  private async applyCommentModeration(
    commentId: string,
    status: Exclude<ModerationItem['status'], 'open'>,
  ): Promise<void> {
    if (status === 'hidden' || status === 'rejected') {
      await this.comments.hide(commentId);
    }
  }

  private nextPostId(): string {
    let id = formatId('post', this._postSequence);
    while (this._posts.has(id)) {
      this._postSequence += 1;
      id = formatId('post', this._postSequence);
    }
    this._postSequence += 1;
    return id;
  }

  private nextMediaId(): string {
    let id = formatId('media', this._mediaSequence);
    while (this._postMedia.has(id)) {
      this._mediaSequence += 1;
      id = formatId('media', this._mediaSequence);
    }
    this._mediaSequence += 1;
    return id;
  }

  private nextCommentId(): string {
    let id = formatId('comment', this._commentSequence);
    while (this._comments.has(id)) {
      this._commentSequence += 1;
      id = formatId('comment', this._commentSequence);
    }
    this._commentSequence += 1;
    return id;
  }

  private nextCartId(): string {
    let id = formatId('cart', this._cartSequence);
    while (this._cartItems.has(id)) {
      this._cartSequence += 1;
      id = formatId('cart', this._cartSequence);
    }
    this._cartSequence += 1;
    return id;
  }

  private nextModerationId(): string {
    let id = formatId('mod', this._moderationSequence);
    while (this._moderationItems.has(id)) {
      this._moderationSequence += 1;
      id = formatId('mod', this._moderationSequence);
    }
    this._moderationSequence += 1;
    return id;
  }
}

function edgeKey(actorId: ConnectId, targetId: ConnectId): string {
  return `${actorId}->${targetId}`;
}

function productTagKey(postId: string, productId: ConnectId): string {
  return `${postId}->${productId}`;
}

function postLikeKey(actorUserId: ConnectId, postId: string): string {
  return `${actorUserId}->${postId}`;
}

function savedPostKey(userId: ConnectId, postId: string): string {
  return `${userId}->${postId}`;
}

function brandFollowKey(userId: ConnectId, brandId: ConnectId): string {
  return `${userId}->${brandId}`;
}

function formatId(prefix: string, sequence: number): string {
  return `${prefix}_${String(sequence).padStart(3, '0')}`;
}

function assertPositiveQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new WearStoreError('invalid_quantity', 'Quantity must be a positive integer.');
  }
}

function pagePosts(items: readonly Post[], params?: WearPageParams): WearPage<Post> {
  return pageItems(items, params);
}

function pageItems<T>(items: readonly T[], params?: WearPageParams): WearPage<T> {
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
  const startIndex = parseCursor(params?.cursor);
  const page = items.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < items.length ? String(startIndex + limit) : null;
  return { items: page, nextCursor };
}

function parseCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const parsed = Number(cursor);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new WearStoreError('invalid_cursor', 'Cursor must be a non-negative integer.');
  }
  return parsed;
}
