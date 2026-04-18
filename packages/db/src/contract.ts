/**
 * Citizens Wear data model — TypeScript contract.
 *
 * These interfaces mirror `prisma/schema.prisma` one-for-one. They are the
 * types the application should program against; the concrete implementation
 * is `MemoryWearStore` today and a Prisma-backed store tomorrow (Phase 3).
 *
 * Wear owns: `Profile`, `Follow`, `UserSettings`.
 * Connect owns: `User`, `Brand` (mirrored here for local reads).
 */
import type { ConnectId, IsoDateTime } from '@citizens-wear/connect-client';

export type { ConnectId, IsoDateTime };

export type ProfileVisibility = 'public' | 'private';

/** Kind of a profile page — user vs brand. Brand profiles are rendered from
 * `Brand` + `User` (the owner); user profiles from `User` + `Profile`.
 */
export type ProfileKind = 'user' | 'brand';

export interface Profile {
  readonly userId: ConnectId;
  readonly bio: string | null;
  readonly visibility: ProfileVisibility;
  /** Wear-side verified flag (distinct from `Brand.verified`). */
  readonly verified: boolean;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface UserSettings {
  readonly userId: ConnectId;
  readonly displayNameOverride: string | null;
  readonly profileVisibility: ProfileVisibility;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface FollowEdge {
  readonly actorId: ConnectId;
  readonly targetId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface FollowCounts {
  readonly followers: number;
  readonly following: number;
}

/** Repository for Wear-owned profile state. */
export interface ProfileRepo {
  get(userId: ConnectId): Promise<Profile | null>;
  /** Return the profile, creating a default `PUBLIC` one if missing. */
  getOrCreate(userId: ConnectId): Promise<Profile>;
  update(
    userId: ConnectId,
    patch: Partial<Pick<Profile, 'bio' | 'visibility' | 'verified'>>,
  ): Promise<Profile>;
}

/** Repository for the follow graph. */
export interface FollowRepo {
  follow(actorId: ConnectId, targetId: ConnectId): Promise<FollowEdge>;
  unfollow(actorId: ConnectId, targetId: ConnectId): Promise<void>;
  isFollowing(actorId: ConnectId, targetId: ConnectId): Promise<boolean>;
  counts(userId: ConnectId): Promise<FollowCounts>;
  followers(userId: ConnectId): Promise<readonly FollowEdge[]>;
  following(userId: ConnectId): Promise<readonly FollowEdge[]>;
}

/** Repository for per-user settings. */
export interface SettingsRepo {
  get(userId: ConnectId): Promise<UserSettings>;
  update(
    userId: ConnectId,
    patch: Partial<Pick<UserSettings, 'displayNameOverride' | 'profileVisibility'>>,
  ): Promise<UserSettings>;
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 — posts, media, likes, comments, saves.
// ─────────────────────────────────────────────────────────────────────────

/**
 * A post authored by either a citizen or a brand. `authorId` is always a
 * `User` id; `brandId` is set iff the post is published *as* a brand (the
 * brand composer). This keeps the follow graph and the post table in the
 * same id-space.
 */
export interface Post {
  readonly id: string;
  readonly authorId: ConnectId;
  readonly brandId: ConnectId | null;
  readonly body: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  /** Product ids tagged on the post. Read-only snapshots from Connect. */
  readonly taggedProductIds: readonly ConnectId[];
}

export type PostMediaKind = 'image' | 'video';

export interface PostMedia {
  readonly id: string;
  readonly postId: string;
  readonly url: string;
  readonly kind: PostMediaKind;
  readonly altText: string | null;
  readonly orderIndex: number;
}

export interface LikeEdge {
  readonly postId: string;
  readonly userId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface Comment {
  readonly id: string;
  readonly postId: string;
  readonly authorId: ConnectId;
  readonly parentCommentId: string | null;
  readonly body: string;
  readonly createdAt: IsoDateTime;
}

export interface CommentLikeEdge {
  readonly commentId: string;
  readonly userId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface SaveCollection {
  readonly id: string;
  readonly ownerId: ConnectId;
  readonly name: string;
  readonly createdAt: IsoDateTime;
  readonly postIds: readonly string[];
}

export interface CreatePostInput {
  readonly authorId: ConnectId;
  readonly brandId?: ConnectId | null;
  readonly body: string;
  readonly media?: readonly Omit<PostMedia, 'id' | 'postId'>[];
  readonly taggedProductIds?: readonly ConnectId[];
}

export interface PostWithMedia {
  readonly post: Post;
  readonly media: readonly PostMedia[];
}

export interface FeedPageParams {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface FeedPage {
  readonly items: readonly PostWithMedia[];
  readonly nextCursor: string | null;
}

/** Repository for posts, their media, and the feed view. */
export interface PostRepo {
  create(input: CreatePostInput, now?: () => Date): Promise<PostWithMedia>;
  getById(id: string): Promise<PostWithMedia | null>;
  listByAuthor(authorId: ConnectId, params?: FeedPageParams): Promise<FeedPage>;
  listByBrand(brandId: ConnectId, params?: FeedPageParams): Promise<FeedPage>;
  /** Chronological feed of posts by users `viewerId` follows (plus self). */
  feedChronological(viewerId: ConnectId, params?: FeedPageParams): Promise<FeedPage>;
  /**
   * Recency-weighted ranker stub used when the `CW_FOR_YOU_RANKER` feature
   * flag is on. Public posts from followed authors score higher than
   * second-degree, and newer posts outrank older ones. Phase 5 replaces
   * this with a real ranking service.
   */
  feedForYou(viewerId: ConnectId, params?: FeedPageParams): Promise<FeedPage>;
}

/** Repository for post and comment likes. */
export interface LikeRepo {
  likePost(postId: string, userId: ConnectId): Promise<LikeEdge>;
  unlikePost(postId: string, userId: ConnectId): Promise<void>;
  isPostLiked(postId: string, userId: ConnectId): Promise<boolean>;
  postLikeCount(postId: string): Promise<number>;
  likeComment(commentId: string, userId: ConnectId): Promise<CommentLikeEdge>;
  unlikeComment(commentId: string, userId: ConnectId): Promise<void>;
  commentLikeCount(commentId: string): Promise<number>;
  /** Posts the user has liked, newest-first (for the activity tab). */
  postsLikedBy(userId: ConnectId): Promise<readonly LikeEdge[]>;
}

/** Repository for threaded post comments. */
export interface CommentRepo {
  create(input: {
    readonly postId: string;
    readonly authorId: ConnectId;
    readonly body: string;
    readonly parentCommentId?: string | null;
  }): Promise<Comment>;
  listForPost(postId: string): Promise<readonly Comment[]>;
  /** Comments authored by `userId`, newest-first (for the activity tab). */
  authoredBy(userId: ConnectId): Promise<readonly Comment[]>;
  commentsForPostCount(postId: string): Promise<number>;
}

/** Repository for user-owned save collections. */
export interface SaveRepo {
  getOrCreateDefault(ownerId: ConnectId): Promise<SaveCollection>;
  listForOwner(ownerId: ConnectId): Promise<readonly SaveCollection[]>;
  savePost(ownerId: ConnectId, postId: string, collectionId?: string): Promise<SaveCollection>;
  unsavePost(ownerId: ConnectId, postId: string, collectionId?: string): Promise<void>;
  isSaved(ownerId: ConnectId, postId: string): Promise<boolean>;
}

/** The full Wear data surface. */
export interface WearStore {
  readonly profiles: ProfileRepo;
  readonly follows: FollowRepo;
  readonly settings: SettingsRepo;
  readonly posts: PostRepo;
  readonly likes: LikeRepo;
  readonly comments: CommentRepo;
  readonly saves: SaveRepo;
}

/** Errors thrown by a `WearStore`. */
export class WearStoreError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'WearStoreError';
    this.code = code;
  }
}
