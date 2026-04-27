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

export type PostAuthorKind = 'citizen' | 'brand';
export type PostStatus = 'draft' | 'pending_review' | 'published' | 'hidden' | 'rejected';
export type PostVisibility = 'public' | 'followers';
export type CommentStatus = 'visible' | 'hidden';
export type ModerationTargetType = 'post' | 'comment' | 'creator_submission';
export type ModerationStatus = 'open' | 'approved' | 'rejected' | 'hidden';

const trustedPostListAccessMarker: unique symbol = Symbol('TrustedPostListAccess');

export interface TrustedPostListAccess {
  readonly [trustedPostListAccessMarker]: true;
}

export function createTrustedPostListAccess(): TrustedPostListAccess {
  return { [trustedPostListAccessMarker]: true };
}

export function hasTrustedPostListAccess(value: unknown): value is TrustedPostListAccess {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { readonly [trustedPostListAccessMarker]?: unknown })[trustedPostListAccessMarker] ===
      true
  );
}

export interface WearPageParams {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface WearPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export interface Post {
  readonly id: string;
  readonly authorUserId: ConnectId;
  readonly authorKind: PostAuthorKind;
  readonly brandId: ConnectId | null;
  readonly caption: string;
  readonly status: PostStatus;
  readonly visibility: PostVisibility;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly publishedAt: IsoDateTime | null;
}

export interface PostMedia {
  readonly id: string;
  readonly postId: string;
  readonly url: string;
  readonly altText: string;
  readonly sortOrder: number;
}

export interface PostProductTag {
  readonly postId: string;
  readonly productId: ConnectId;
  readonly sortOrder: number;
}

export interface PostLike {
  readonly postId: string;
  readonly actorUserId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface SavedPost {
  readonly userId: ConnectId;
  readonly postId: string;
  readonly createdAt: IsoDateTime;
}

export interface PostComment {
  readonly id: string;
  readonly postId: string;
  readonly authorUserId: ConnectId;
  readonly body: string;
  readonly status: CommentStatus;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface CartItem {
  readonly id: string;
  readonly userId: ConnectId;
  readonly productId: ConnectId;
  readonly quantity: number;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface BrandFollow {
  readonly userId: ConnectId;
  readonly brandId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface BrandFollowCounts {
  readonly followers: number;
}

export interface ModerationItem {
  readonly id: string;
  readonly targetType: ModerationTargetType;
  readonly targetId: string;
  readonly reporterUserId: ConnectId | null;
  readonly status: ModerationStatus;
  readonly reason: string;
  readonly note: string | null;
  readonly reviewerUserId: ConnectId | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly resolvedAt: IsoDateTime | null;
}

export interface CreatePostMediaInput {
  readonly url: string;
  readonly altText: string;
  readonly sortOrder?: number;
}

export interface CreatePostProductTagInput {
  readonly productId: ConnectId;
  readonly sortOrder?: number;
}

export interface CreatePostInput {
  readonly authorUserId: ConnectId;
  readonly brandId?: ConnectId | null;
  readonly caption: string;
  readonly status?: PostStatus;
  readonly visibility?: PostVisibility;
  readonly media?: readonly CreatePostMediaInput[];
  readonly productTags?: readonly CreatePostProductTagInput[];
  readonly publishedAt?: IsoDateTime | null;
}

export interface PostListParams extends WearPageParams {
  readonly viewerUserId?: ConnectId;
  /** Trusted owner/admin call paths only; cannot be constructed from public query input. */
  readonly trustedAccess?: TrustedPostListAccess;
  readonly status?: PostStatus;
}

export interface FeedParams extends PostListParams {
  readonly authorUserId?: ConnectId;
  readonly brandId?: ConnectId;
}

export interface CreateCommentInput {
  readonly postId: string;
  readonly authorUserId: ConnectId;
  readonly body: string;
}

export interface OpenModerationItemInput {
  readonly targetType: ModerationTargetType;
  readonly targetId: string;
  readonly reporterUserId?: ConnectId | null;
  readonly reason: string;
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

/** Repository for social posts and their Connect-owned product tags. */
export interface PostRepo {
  create(input: CreatePostInput): Promise<Post>;
  get(postId: string): Promise<Post | null>;
  update(
    postId: string,
    patch: Partial<Pick<Post, 'caption' | 'status' | 'visibility' | 'publishedAt'>>,
  ): Promise<Post>;
  listFeed(params?: FeedParams): Promise<WearPage<Post>>;
  listForAuthor(authorUserId: ConnectId, params?: PostListParams): Promise<WearPage<Post>>;
  listForBrand(brandId: ConnectId, params?: PostListParams): Promise<WearPage<Post>>;
  listMedia(postId: string): Promise<readonly PostMedia[]>;
  listProductTags(postId: string): Promise<readonly PostProductTag[]>;
}

/** Repository for post likes. */
export interface PostEngagementRepo {
  like(actorUserId: ConnectId, postId: string): Promise<PostLike>;
  unlike(actorUserId: ConnectId, postId: string): Promise<void>;
  isLiked(actorUserId: ConnectId, postId: string): Promise<boolean>;
  likeCount(postId: string): Promise<number>;
}

/** Repository for post comments. */
export interface CommentRepo {
  create(input: CreateCommentInput): Promise<PostComment>;
  get(commentId: string): Promise<PostComment | null>;
  listForPost(postId: string, params?: WearPageParams): Promise<WearPage<PostComment>>;
  hide(commentId: string): Promise<PostComment>;
}

/** Repository for saved posts. */
export interface SaveRepo {
  save(userId: ConnectId, postId: string): Promise<SavedPost>;
  unsave(userId: ConnectId, postId: string): Promise<void>;
  isSaved(userId: ConnectId, postId: string): Promise<boolean>;
  listForUser(userId: ConnectId, params?: WearPageParams): Promise<WearPage<SavedPost>>;
}

/** Repository for cart intent. Checkout remains out of scope for this slice. */
export interface CartRepo {
  addItem(userId: ConnectId, productId: ConnectId, quantity?: number): Promise<CartItem>;
  updateQuantity(userId: ConnectId, cartItemId: string, quantity: number): Promise<CartItem>;
  removeItem(userId: ConnectId, cartItemId: string): Promise<void>;
  listForUser(userId: ConnectId): Promise<readonly CartItem[]>;
  countForUser(userId: ConnectId): Promise<number>;
  clear(userId: ConnectId): Promise<void>;
}

/** Repository for following Connect-owned brands. */
export interface BrandFollowRepo {
  follow(userId: ConnectId, brandId: ConnectId): Promise<BrandFollow>;
  unfollow(userId: ConnectId, brandId: ConnectId): Promise<void>;
  isFollowing(userId: ConnectId, brandId: ConnectId): Promise<boolean>;
  counts(brandId: ConnectId): Promise<BrandFollowCounts>;
  followers(brandId: ConnectId): Promise<readonly BrandFollow[]>;
  following(userId: ConnectId): Promise<readonly BrandFollow[]>;
}

/** Repository for creator/admin moderation queues. */
export interface ModerationRepo {
  open(input: OpenModerationItemInput): Promise<ModerationItem>;
  get(itemId: string): Promise<ModerationItem | null>;
  listQueue(params?: WearPageParams): Promise<WearPage<ModerationItem>>;
  resolve(
    itemId: string,
    reviewerUserId: ConnectId,
    status: Exclude<ModerationStatus, 'open'>,
    note?: string | null,
  ): Promise<ModerationItem>;
}

/** The full Wear data surface. */
export interface WearStore {
  readonly profiles: ProfileRepo;
  readonly follows: FollowRepo;
  readonly settings: SettingsRepo;
  readonly posts: PostRepo;
  readonly postEngagement: PostEngagementRepo;
  readonly comments: CommentRepo;
  readonly saves: SaveRepo;
  readonly cart: CartRepo;
  readonly brandFollows: BrandFollowRepo;
  readonly moderation: ModerationRepo;
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
