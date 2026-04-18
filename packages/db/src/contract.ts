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
  // Phase 5 — discovery surface.
  /**
   * Full-text search across post bodies (case-insensitive substring).
   * Phase 5 ships an in-memory implementation; Phase 8+ swaps in Postgres
   * full-text or an external search index without touching callers.
   */
  searchByText(query: string, params?: FeedPageParams): Promise<FeedPage>;
  /**
   * All posts that mention `tag` (case-insensitive, with or without a
   * leading `#`). Newest first.
   */
  listByHashtag(tag: string, params?: FeedPageParams): Promise<FeedPage>;
  /**
   * Trending hashtags, scored by post count with a freshness boost over
   * the last `windowMs` (default 14 days). Returns at most `limit` tags.
   */
  trendingHashtags(options?: {
    readonly limit?: number;
    readonly windowMs?: number;
  }): Promise<readonly TrendingHashtag[]>;
}

export interface TrendingHashtag {
  readonly tag: string;
  readonly postCount: number;
  readonly score: number;
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

// ─────────────────────────────────────────────────────────────────────────
// Phase 6 — stories, direct messages, blocks, reports.
// ─────────────────────────────────────────────────────────────────────────

export type StoryMediaKind = 'image' | 'video' | 'text';
export type StoryAudience = 'public' | 'followers';

/**
 * 24-hour ephemeral story. `expiresAt` is set at creation time
 * (createdAt + 24h by default); the repo never returns expired stories
 * to non-author viewers. Stories may also be promoted into a long-lived
 * `StoryHighlight` by their author.
 */
export interface Story {
  readonly id: string;
  readonly authorId: ConnectId;
  readonly brandId: ConnectId | null;
  readonly mediaUrl: string | null;
  readonly mediaKind: StoryMediaKind;
  readonly caption: string | null;
  readonly audience: StoryAudience;
  readonly createdAt: IsoDateTime;
  readonly expiresAt: IsoDateTime;
}

export interface StoryView {
  readonly storyId: string;
  readonly viewerId: ConnectId;
  readonly viewedAt: IsoDateTime;
}

/** Curated "best of" collection of stories surfaced on a profile. */
export interface StoryHighlight {
  readonly id: string;
  readonly ownerId: ConnectId;
  readonly name: string;
  readonly coverUrl: string | null;
  readonly createdAt: IsoDateTime;
  readonly storyIds: readonly string[];
}

/** Story reactions are restricted to a small, non-numeric set. */
export type StoryReactionKind = 'amen' | 'love' | 'fire' | 'pray' | 'crown';

export interface StoryReaction {
  readonly id: string;
  readonly storyId: string;
  readonly userId: ConnectId;
  readonly kind: StoryReactionKind;
  readonly createdAt: IsoDateTime;
}

export interface CreateStoryInput {
  readonly authorId: ConnectId;
  readonly brandId?: ConnectId | null;
  readonly mediaUrl?: string | null;
  readonly mediaKind?: StoryMediaKind;
  readonly caption?: string | null;
  readonly audience?: StoryAudience;
  /** Optional override; defaults to 24 hours from `now()`. */
  readonly ttlMs?: number;
}

export interface StoryRepo {
  create(input: CreateStoryInput, now?: () => Date): Promise<Story>;
  getById(id: string): Promise<Story | null>;
  /** Author's stories, including expired ones (for highlight curation). */
  listByAuthor(authorId: ConnectId): Promise<readonly Story[]>;
  /** Active (non-expired) stories the viewer can see, newest first. */
  listActiveForViewer(viewerId: ConnectId): Promise<readonly Story[]>;
  /** Active stories grouped by author for the feed "tray" strip. */
  trayForViewer(viewerId: ConnectId): Promise<readonly StoryTrayEntry[]>;
  recordView(storyId: string, viewerId: ConnectId): Promise<StoryView>;
  listViewers(storyId: string, callerId: ConnectId): Promise<readonly StoryView[]>;
  addReaction(input: {
    readonly storyId: string;
    readonly userId: ConnectId;
    readonly kind: StoryReactionKind;
  }): Promise<StoryReaction>;
  listReactions(storyId: string): Promise<readonly StoryReaction[]>;
  /** Author-driven deletion before expiry. */
  delete(storyId: string, authorId: ConnectId): Promise<void>;
}

export interface StoryTrayEntry {
  readonly authorId: ConnectId;
  readonly latestStoryId: string;
  readonly latestCreatedAt: IsoDateTime;
  readonly storyCount: number;
  readonly hasUnseen: boolean;
}

export interface HighlightRepo {
  create(input: {
    readonly ownerId: ConnectId;
    readonly name: string;
    readonly coverUrl?: string | null;
  }): Promise<StoryHighlight>;
  listForOwner(ownerId: ConnectId): Promise<readonly StoryHighlight[]>;
  getById(id: string): Promise<StoryHighlight | null>;
  addStory(highlightId: string, storyId: string, ownerId: ConnectId): Promise<StoryHighlight>;
  removeStory(highlightId: string, storyId: string, ownerId: ConnectId): Promise<StoryHighlight>;
  delete(highlightId: string, ownerId: ConnectId): Promise<void>;
}

export type ConversationKind = 'direct' | 'group';
export type ConversationRequestState = 'requested' | 'accepted';

export interface Conversation {
  readonly id: string;
  readonly kind: ConversationKind;
  readonly name: string | null;
  readonly createdById: ConnectId;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface ConversationMember {
  readonly conversationId: string;
  readonly userId: ConnectId;
  readonly joinedAt: IsoDateTime;
  readonly lastReadAt: IsoDateTime | null;
  readonly mutedUntil: IsoDateTime | null;
  readonly requestState: ConversationRequestState;
  readonly role: 'owner' | 'member';
}

export interface Message {
  readonly id: string;
  readonly conversationId: string;
  readonly authorId: ConnectId;
  readonly body: string;
  readonly createdAt: IsoDateTime;
  readonly deletedAt: IsoDateTime | null;
}

export interface ConversationSummary {
  readonly conversation: Conversation;
  readonly members: readonly ConversationMember[];
  readonly lastMessage: Message | null;
  /** Unread message count for the caller. */
  readonly unreadCount: number;
}

export interface ConversationRepo {
  /**
   * Get-or-create the canonical 1:1 conversation between `actorId` and
   * `otherId`. Idempotent. Self-DMs are rejected.
   */
  getOrCreateDirect(actorId: ConnectId, otherId: ConnectId): Promise<Conversation>;
  createGroup(input: {
    readonly createdById: ConnectId;
    readonly name: string;
    readonly memberIds: readonly ConnectId[];
  }): Promise<Conversation>;
  getById(id: string, callerId: ConnectId): Promise<Conversation | null>;
  /** Membership row for `userId` in `conversationId`, or `null`. */
  membership(conversationId: string, userId: ConnectId): Promise<ConversationMember | null>;
  listMembers(conversationId: string): Promise<readonly ConversationMember[]>;
  /** Conversations the caller is in, newest activity first. */
  listForUser(
    userId: ConnectId,
    options?: { readonly requestState?: ConversationRequestState },
  ): Promise<readonly ConversationSummary[]>;
  /** Mark all messages up to `now()` as read for `userId`. */
  markRead(conversationId: string, userId: ConnectId): Promise<void>;
  acceptRequest(conversationId: string, userId: ConnectId): Promise<ConversationMember>;
  declineRequest(conversationId: string, userId: ConnectId): Promise<void>;
  setMuted(
    conversationId: string,
    userId: ConnectId,
    mutedUntil: IsoDateTime | null,
  ): Promise<ConversationMember>;
  leave(conversationId: string, userId: ConnectId): Promise<void>;
}

export interface MessageRepo {
  send(input: {
    readonly conversationId: string;
    readonly authorId: ConnectId;
    readonly body: string;
  }): Promise<Message>;
  list(
    conversationId: string,
    callerId: ConnectId,
    params?: { readonly limit?: number; readonly cursor?: string },
  ): Promise<{ readonly items: readonly Message[]; readonly nextCursor: string | null }>;
  /** Soft-delete a message authored by `callerId`. */
  deleteOwn(messageId: string, callerId: ConnectId): Promise<void>;
}

export interface BlockEdge {
  readonly actorId: ConnectId;
  readonly targetId: ConnectId;
  readonly createdAt: IsoDateTime;
}

export interface BlockRepo {
  block(actorId: ConnectId, targetId: ConnectId): Promise<BlockEdge>;
  unblock(actorId: ConnectId, targetId: ConnectId): Promise<void>;
  /** True if `actorId` has blocked `targetId` OR vice versa. */
  isBlockedEither(a: ConnectId, b: ConnectId): Promise<boolean>;
  listBlocked(actorId: ConnectId): Promise<readonly BlockEdge[]>;
}

export type ReportSubjectKind = 'post' | 'comment' | 'message' | 'story' | 'user';
export type ReportReason = 'spam' | 'abuse' | 'sexual' | 'self_harm' | 'illegal' | 'other';

export interface Report {
  readonly id: string;
  readonly reporterId: ConnectId;
  readonly subjectKind: ReportSubjectKind;
  readonly subjectId: string;
  readonly reason: ReportReason;
  readonly note: string | null;
  readonly createdAt: IsoDateTime;
}

export interface ReportRepo {
  create(input: {
    readonly reporterId: ConnectId;
    readonly subjectKind: ReportSubjectKind;
    readonly subjectId: string;
    readonly reason: ReportReason;
    readonly note?: string | null;
  }): Promise<Report>;
  listForSubject(subjectKind: ReportSubjectKind, subjectId: string): Promise<readonly Report[]>;
  listByReporter(reporterId: ConnectId): Promise<readonly Report[]>;
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
  readonly stories: StoryRepo;
  readonly highlights: HighlightRepo;
  readonly conversations: ConversationRepo;
  readonly messages: MessageRepo;
  readonly blocks: BlockRepo;
  readonly reports: ReportRepo;
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
