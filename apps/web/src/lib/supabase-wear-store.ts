import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  WearStoreError,
  extractHashtags,
  normaliseHashtag,
  type BlockEdge,
  type BlockRepo,
  type BrandRepo,
  type Comment,
  type CommentRepo,
  type ConnectId,
  type Conversation,
  type ConversationMember,
  type ConversationRepo,
  type ConversationRequestState,
  type ConversationSummary,
  type CreateBrandInput,
  type CreatePostInput,
  type CreateStoryInput,
  type FeedPage,
  type FeedPageParams,
  type FollowCounts,
  type FollowEdge,
  type FollowRepo,
  type HighlightRepo,
  type LikeEdge,
  type LikeRepo,
  type Message,
  type MessageRepo,
  type Page,
  type PageParams,
  type Post,
  type PostMedia,
  type PostRepo,
  type PostWithMedia,
  type Profile,
  type ProfileRepo,
  type Report,
  type ReportRepo,
  type SaveCollection,
  type SaveRepo,
  type SettingsRepo,
  type Story,
  type StoryHighlight,
  type StoryReaction,
  type StoryRepo,
  type StoryReactionKind,
  type StoryTrayEntry,
  type StoryView,
  type TrendingHashtag,
  type UpdateBrandInput,
  type UpsertUserInput,
  type UserRepo,
  type UserSettings,
  type WearBrand,
  type WearStore,
  type WearUser,
} from '@citizens-wear/db';

/**
 * Production `WearStore` backed by the shared Supabase project's `wear.*`
 * schema (ADR-0007, STEP3 §5 Q2). Every query runs through an **injected,
 * request-scoped** client bound to `db:{schema:'wear'}` and carrying the
 * caller's auth cookies, so **RLS enforces isolation as the signed-in user**
 * (SHARED_DB_CONTRACT R3 — RLS is the only wall). Never share one instance
 * across requests.
 *
 * This is an I/O adapter: it is not unit-testable without Postgres, so it is
 * excluded from the coverage allowlist and validated by (a) mirroring the
 * `MemoryWearStore` contract (the semantic spec), (b) `tsc` + `next build`,
 * and (c) a production RLS smoke test via the Supabase MCP. Where mig-143 RLS
 * cannot express a write, it delegates to the SECURITY DEFINER helpers added
 * in mig 144 (`create_direct_conversation`, `create_group_conversation`) and
 * relies on the two triggers there (conversation `updated_at` bump on message;
 * symmetric unfollow on block).
 */
export class SupabaseWearStore implements WearStore {
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

  private readonly db: SupabaseClient;
  private readonly now: () => Date;

  public constructor(client: SupabaseClient, options: { readonly now?: () => Date } = {}) {
    this.db = client;
    this.now = options.now ?? (() => new Date());

    this.users = this._users();
    this.brands = this._brands();
    this.profiles = this._profiles();
    this.follows = this._follows();
    this.settings = this._settings();
    this.posts = this._posts();
    this.likes = this._likes();
    this.comments = this._comments();
    this.saves = this._saves();
    this.stories = this._stories();
    this.highlights = this._highlights();
    this.conversations = this._conversations();
    this.messages = this._messages();
    this.blocks = this._blocks();
    this.reports = this._reports();
  }

  // ── Identity mirror ───────────────────────────────────────────────────────
  private _users(): UserRepo {
    return {
      getById: async (id) => {
        const row = await this._maybeSingle(this.db.from('users').select(USER_COLS).eq('id', id));
        return row ? mapUser(row) : null;
      },
      getByHandle: async (handle) => {
        const row = await this._maybeSingle(
          this.db.from('users').select(USER_COLS).ilike('handle', handle.trim()),
        );
        return row ? mapUser(row) : null;
      },
      search: async (query, params) => {
        const q = query.trim();
        let builder = this.db.from('users').select(USER_COLS).order('handle', { ascending: true });
        if (q) builder = builder.or(`handle.ilike.%${escapeLike(q)}%,display_name.ilike.%${escapeLike(q)}%`);
        return this._pageFrom(builder, params, mapUser);
      },
      upsertFromSession: async (input: UpsertUserInput) => {
        const existing = await this._maybeSingle(
          this.db.from('users').select(USER_COLS).eq('id', input.id),
        );
        if (existing) {
          const updated = await this._single(
            this.db
              .from('users')
              .update({ display_name: input.displayName, avatar_url: input.avatarUrl ?? null })
              .eq('id', input.id)
              .select(USER_COLS),
          );
          return mapUser(updated);
        }
        // First sign-in: insert with a unique handle, retrying on collision.
        const base = (input.handle.trim().toLowerCase() || `user_${input.id.slice(0, 8)}`).slice(0, 32);
        for (let attempt = 0; attempt < 25; attempt += 1) {
          const handle = attempt === 0 ? base : `${base}-${attempt + 1}`;
          const { data, error } = await this.db
            .from('users')
            .insert({
              id: input.id,
              handle,
              display_name: input.displayName,
              avatar_url: input.avatarUrl ?? null,
            })
            .select(USER_COLS)
            .single();
          if (!error && data) return mapUser(data as UserRow);
          if (error && error.code === '23505' && /handle/i.test(error.message)) continue; // handle taken
          if (error && error.code === '23505') {
            // id collided → a row already exists (race); read it back.
            const row = await this._single(this.db.from('users').select(USER_COLS).eq('id', input.id));
            return mapUser(row);
          }
          if (error) throw wrap(error);
        }
        throw new WearStoreError('handle_exhausted', 'Could not allocate a unique handle.');
      },
    };
  }

  // ── Brands ────────────────────────────────────────────────────────────────
  private _brands(): BrandRepo {
    return {
      getById: async (id) => {
        const row = await this._maybeSingle(this.db.from('brands').select(BRAND_COLS).eq('id', id));
        return row ? mapBrand(row) : null;
      },
      getBySlug: async (slug) => {
        const row = await this._maybeSingle(
          this.db.from('brands').select(BRAND_COLS).ilike('slug', slug.trim()),
        );
        return row ? mapBrand(row) : null;
      },
      listAll: async (params) =>
        this._pageFrom(
          this.db.from('brands').select(BRAND_COLS).order('created_at', { ascending: true }),
          params,
          mapBrand,
        ),
      listForOwner: async (ownerId) => {
        const rows = await this._many(
          this.db
            .from('brands')
            .select(BRAND_COLS)
            .eq('owner_user_id', ownerId)
            .order('created_at', { ascending: true }),
        );
        return rows.map(mapBrand);
      },
      search: async (query, params) => {
        const q = query.trim();
        let builder = this.db.from('brands').select(BRAND_COLS).order('name', { ascending: true });
        if (q)
          builder = builder.or(
            `name.ilike.%${escapeLike(q)}%,slug.ilike.%${escapeLike(q)}%,tagline.ilike.%${escapeLike(q)}%`,
          );
        return this._pageFrom(builder, params, mapBrand);
      },
      create: async (input: CreateBrandInput) => {
        const slug = input.slug.trim().toLowerCase();
        if (!slug) throw new WearStoreError('invalid_slug', 'Brand slug must not be empty.');
        const { data, error } = await this.db
          .from('brands')
          .insert({
            slug,
            name: input.name,
            tagline: input.tagline ?? null,
            website_url: input.websiteUrl ?? null,
            logo_url: input.logoUrl ?? null,
            owner_user_id: input.ownerId,
            connect_contributor_id: input.connectContributorId ?? null,
          })
          .select(BRAND_COLS)
          .single();
        if (error) {
          if (error.code === '23505') {
            throw new WearStoreError('slug_taken', `Brand slug ${slug} is already in use.`);
          }
          throw wrap(error);
        }
        return mapBrand(data as BrandRow);
      },
      update: async (brandId, ownerId, patch: UpdateBrandInput) => {
        // Ownership is also enforced by RLS; we check first for a clean error.
        const current = await this._maybeSingle(
          this.db.from('brands').select(BRAND_COLS).eq('id', brandId),
        );
        if (!current) throw new WearStoreError('brand_not_found', `Unknown brand ${brandId}.`);
        if (current.owner_user_id !== ownerId) {
          throw new WearStoreError('forbidden', 'Only the owner can edit this brand.');
        }
        const patchRow: Record<string, unknown> = {};
        if (patch.name !== undefined) patchRow.name = patch.name;
        if (patch.tagline !== undefined) patchRow.tagline = patch.tagline;
        if (patch.websiteUrl !== undefined) patchRow.website_url = patch.websiteUrl;
        if (patch.logoUrl !== undefined) patchRow.logo_url = patch.logoUrl;
        if (patch.connectContributorId !== undefined)
          patchRow.connect_contributor_id = patch.connectContributorId;
        if (Object.keys(patchRow).length === 0) return mapBrand(current);
        const updated = await this._single(
          this.db.from('brands').update(patchRow).eq('id', brandId).select(BRAND_COLS),
        );
        return mapBrand(updated);
      },
    };
  }

  // ── Wear-owned profile state ──────────────────────────────────────────────
  private _profiles(): ProfileRepo {
    return {
      get: async (userId) => {
        const row = await this._maybeSingle(
          this.db.from('profiles').select(PROFILE_COLS).eq('user_id', userId),
        );
        return row ? mapProfile(row) : null;
      },
      getOrCreate: async (userId) => {
        const existing = await this._maybeSingle(
          this.db.from('profiles').select(PROFILE_COLS).eq('user_id', userId),
        );
        if (existing) return mapProfile(existing);
        const created = await this._single(
          this.db.from('profiles').insert({ user_id: userId }).select(PROFILE_COLS),
        );
        return mapProfile(created);
      },
      update: async (userId, patch) => {
        const row: Record<string, unknown> = { user_id: userId };
        if (patch.bio !== undefined) row.bio = patch.bio;
        if (patch.visibility !== undefined) row.visibility = patch.visibility;
        if (patch.verified !== undefined) row.verified = patch.verified;
        const updated = await this._single(
          this.db.from('profiles').upsert(row, { onConflict: 'user_id' }).select(PROFILE_COLS),
        );
        return mapProfile(updated);
      },
    };
  }

  // ── Follow graph ──────────────────────────────────────────────────────────
  private _follows(): FollowRepo {
    return {
      follow: async (actorId, targetId) => {
        if (actorId === targetId) {
          throw new WearStoreError('self_follow', 'A user cannot follow themselves.');
        }
        const existing = await this._maybeSingle(
          this.db
            .from('follows')
            .select('actor_id,target_id,created_at')
            .eq('actor_id', actorId)
            .eq('target_id', targetId),
        );
        if (existing) return mapFollow(existing);
        const created = await this._single(
          this.db
            .from('follows')
            .insert({ actor_id: actorId, target_id: targetId })
            .select('actor_id,target_id,created_at'),
        );
        return mapFollow(created);
      },
      unfollow: async (actorId, targetId) => {
        await this._run(
          this.db.from('follows').delete().eq('actor_id', actorId).eq('target_id', targetId),
        );
      },
      isFollowing: async (actorId, targetId) => {
        const row = await this._maybeSingle(
          this.db
            .from('follows')
            .select('actor_id')
            .eq('actor_id', actorId)
            .eq('target_id', targetId),
        );
        return row !== null;
      },
      counts: async (userId): Promise<FollowCounts> => {
        const followers = await this._count(
          this.db.from('follows').select('*', { count: 'exact', head: true }).eq('target_id', userId),
        );
        const following = await this._count(
          this.db.from('follows').select('*', { count: 'exact', head: true }).eq('actor_id', userId),
        );
        return { followers, following };
      },
      followers: async (userId) => {
        const rows = await this._many(
          this.db.from('follows').select('actor_id,target_id,created_at').eq('target_id', userId),
        );
        return rows.map(mapFollow);
      },
      following: async (userId) => {
        const rows = await this._many(
          this.db.from('follows').select('actor_id,target_id,created_at').eq('actor_id', userId),
        );
        return rows.map(mapFollow);
      },
    };
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  private _settings(): SettingsRepo {
    return {
      get: async (userId) => {
        const existing = await this._maybeSingle(
          this.db.from('user_settings').select(SETTINGS_COLS).eq('user_id', userId),
        );
        if (existing) return mapSettings(existing);
        const created = await this._single(
          this.db.from('user_settings').insert({ user_id: userId }).select(SETTINGS_COLS),
        );
        return mapSettings(created);
      },
      update: async (userId, patch) => {
        const row: Record<string, unknown> = { user_id: userId };
        if (patch.displayNameOverride !== undefined)
          row.display_name_override = patch.displayNameOverride;
        if (patch.profileVisibility !== undefined) row.profile_visibility = patch.profileVisibility;
        const updated = await this._single(
          this.db
            .from('user_settings')
            .upsert(row, { onConflict: 'user_id' })
            .select(SETTINGS_COLS),
        );
        return mapSettings(updated);
      },
    };
  }

  // ── Posts + feed ──────────────────────────────────────────────────────────
  private _posts(): PostRepo {
    const readPage = async (rows: PostRow[], params?: FeedPageParams): Promise<FeedPage> => {
      const start = parseCursor(params?.cursor);
      const limit = clamp(params?.limit ?? 20, 1, 50);
      const slice = rows.slice(start, start + limit);
      const withMedia = await this._attachMedia(slice);
      return {
        items: withMedia,
        nextCursor: start + slice.length < rows.length ? String(start + slice.length) : null,
      };
    };
    return {
      create: async (input: CreatePostInput) => {
        if (!input.body.trim()) throw new WearStoreError('empty_post', 'Post body must not be empty.');
        const post = await this._single(
          this.db
            .from('posts')
            .insert({
              author_id: input.authorId,
              brand_id: input.brandId ?? null,
              body: input.body,
              tagged_product_ids: [...(input.taggedProductIds ?? [])],
            })
            .select(POST_COLS),
        );
        const media: PostMedia[] = [];
        const inMedia = input.media ?? [];
        if (inMedia.length) {
          const inserted = await this._many(
            this.db
              .from('post_media')
              .insert(
                inMedia.map((m, i) => ({
                  post_id: (post as PostRow).id,
                  url: m.url,
                  kind: m.kind,
                  alt_text: m.altText,
                  order_index: m.orderIndex ?? i,
                })),
              )
              .select(MEDIA_COLS),
          );
          for (const row of inserted.sort((a, b) => a.order_index - b.order_index)) {
            media.push(mapMedia(row));
          }
        }
        return { post: mapPost(post), media };
      },
      getById: async (id) => {
        const row = await this._maybeSingle(this.db.from('posts').select(POST_COLS).eq('id', id));
        if (!row) return null;
        const [withMedia] = await this._attachMedia([row]);
        return withMedia ?? null;
      },
      listByAuthor: async (authorId, params) => {
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .eq('author_id', authorId)
            .order('created_at', { ascending: false }),
        );
        return readPage(rows, params);
      },
      listByBrand: async (brandId, params) => {
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .eq('brand_id', brandId)
            .order('created_at', { ascending: false }),
        );
        return readPage(rows, params);
      },
      feedChronological: async (viewerId, params) => {
        const authorIds = await this._followedPlusSelf(viewerId);
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .in('author_id', authorIds)
            .order('created_at', { ascending: false }),
        );
        return readPage(rows, params);
      },
      feedForYou: async (viewerId, params) => {
        // Recency-weighted ranker mirroring MemoryWearStore: score =
        // 2*isFollowed + freshness (7-day linear decay), newest as tiebreak.
        // Ranks over a bounded recent window (adapter cap; memory ranks the
        // whole in-memory set — a documented, scale-safe divergence).
        const followed = new Set(await this._followedPlusSelf(viewerId));
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .order('created_at', { ascending: false })
            .limit(FOR_YOU_CANDIDATES),
        );
        const nowMs = this.now().getTime();
        const scored = rows.map((p) => {
          const ageMs = nowMs - Date.parse(p.created_at);
          const freshness = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 7));
          return { p, score: (followed.has(p.author_id) ? 2 : 0) + freshness };
        });
        scored.sort(
          (a, b) => b.score - a.score || Date.parse(b.p.created_at) - Date.parse(a.p.created_at),
        );
        return readPage(
          scored.map((s) => s.p),
          params,
        );
      },
      searchByText: async (query, params) => {
        const q = query.trim();
        if (!q) return readPage([], params);
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .ilike('body', `%${escapeLike(q)}%`)
            .order('created_at', { ascending: false }),
        );
        return readPage(rows, params);
      },
      listByHashtag: async (tag, params) => {
        const needle = normaliseHashtag(tag);
        if (!needle) return readPage([], params);
        const rows = await this._many(
          this.db
            .from('posts')
            .select(POST_COLS)
            .ilike('body', `%#${escapeLike(needle)}%`)
            .order('created_at', { ascending: false }),
        );
        // Exact word-boundary match to mirror memory's extractHashtags.
        const matches = rows.filter((p) => extractHashtags(p.body).includes(needle));
        return readPage(matches, params);
      },
      trendingHashtags: async (options) => {
        const limit = clamp(options?.limit ?? 10, 1, 50);
        const windowMs = options?.windowMs ?? 1000 * 60 * 60 * 24 * 14;
        const nowMs = this.now().getTime();
        const sinceIso = new Date(nowMs - windowMs).toISOString();
        // Only posts inside the freshness window contribute a boost; older
        // posts score 0 in memory, so the window bound is loss-free here.
        const rows = await this._many(
          this.db
            .from('posts')
            .select('body,created_at')
            .gte('created_at', sinceIso)
            .order('created_at', { ascending: false })
            .limit(TRENDING_CANDIDATES),
        );
        const counts = new Map<string, { count: number; score: number }>();
        for (const p of rows) {
          const ageMs = nowMs - Date.parse(p.created_at);
          const freshness = ageMs <= windowMs ? 1 - ageMs / windowMs : 0;
          for (const t of extractHashtags(p.body)) {
            const cur = counts.get(t) ?? { count: 0, score: 0 };
            cur.count += 1;
            cur.score += 1 + freshness;
            counts.set(t, cur);
          }
        }
        const ranked: TrendingHashtag[] = [...counts.entries()]
          .map(([tag, v]) => ({ tag, postCount: v.count, score: v.score }))
          .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));
        return ranked.slice(0, limit);
      },
    };
  }

  // ── Likes ─────────────────────────────────────────────────────────────────
  private _likes(): LikeRepo {
    return {
      likePost: async (postId, userId) => {
        const existing = await this._maybeSingle(
          this.db
            .from('likes')
            .select('post_id,user_id,created_at')
            .eq('post_id', postId)
            .eq('user_id', userId),
        );
        if (existing) return mapLike(existing);
        const { data, error } = await this.db
          .from('likes')
          .insert({ post_id: postId, user_id: userId })
          .select('post_id,user_id,created_at')
          .single();
        if (error) {
          if (error.code === '23503') throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
          throw wrap(error);
        }
        return mapLike(data as LikeRow);
      },
      unlikePost: async (postId, userId) => {
        await this._run(
          this.db.from('likes').delete().eq('post_id', postId).eq('user_id', userId),
        );
      },
      isPostLiked: async (postId, userId) => {
        const row = await this._maybeSingle(
          this.db.from('likes').select('post_id').eq('post_id', postId).eq('user_id', userId),
        );
        return row !== null;
      },
      postLikeCount: async (postId) =>
        this._count(
          this.db.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId),
        ),
      likeComment: async (commentId, userId) => {
        const existing = await this._maybeSingle(
          this.db
            .from('comment_likes')
            .select('comment_id,user_id,created_at')
            .eq('comment_id', commentId)
            .eq('user_id', userId),
        );
        if (existing) return mapCommentLike(existing);
        const { data, error } = await this.db
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: userId })
          .select('comment_id,user_id,created_at')
          .single();
        if (error) {
          if (error.code === '23503')
            throw new WearStoreError('comment_not_found', `Unknown comment ${commentId}.`);
          throw wrap(error);
        }
        return mapCommentLike(data as CommentLikeRow);
      },
      unlikeComment: async (commentId, userId) => {
        await this._run(
          this.db.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId),
        );
      },
      commentLikeCount: async (commentId) =>
        this._count(
          this.db
            .from('comment_likes')
            .select('*', { count: 'exact', head: true })
            .eq('comment_id', commentId),
        ),
      postsLikedBy: async (userId) => {
        const rows = await this._many(
          this.db
            .from('likes')
            .select('post_id,user_id,created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapLike);
      },
    };
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  private _comments(): CommentRepo {
    return {
      create: async ({ postId, authorId, body, parentCommentId }) => {
        if (!body.trim()) throw new WearStoreError('empty_comment', 'Comment body must not be empty.');
        const { data, error } = await this.db
          .from('comments')
          .insert({
            post_id: postId,
            author_id: authorId,
            parent_comment_id: parentCommentId ?? null,
            body,
          })
          .select(COMMENT_COLS)
          .single();
        if (error) {
          if (error.code === '23503') {
            // FK on either post_id or parent_comment_id.
            throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
          }
          throw wrap(error);
        }
        return mapComment(data as CommentRow);
      },
      listForPost: async (postId) => {
        const rows = await this._many(
          this.db
            .from('comments')
            .select(COMMENT_COLS)
            .eq('post_id', postId)
            .order('created_at', { ascending: true }),
        );
        return rows.map(mapComment);
      },
      authoredBy: async (userId) => {
        const rows = await this._many(
          this.db
            .from('comments')
            .select(COMMENT_COLS)
            .eq('author_id', userId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapComment);
      },
      commentsForPostCount: async (postId) =>
        this._count(
          this.db.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId),
        ),
    };
  }

  // ── Saves ─────────────────────────────────────────────────────────────────
  private _saves(): SaveRepo {
    const defaultCollection = async (ownerId: ConnectId): Promise<SaveCollectionRow> => {
      const existing = await this._maybeSingle(
        this.db
          .from('save_collections')
          .select(SAVE_COLLECTION_COLS)
          .eq('owner_id', ownerId)
          .eq('name', 'default'),
      );
      if (existing) return existing;
      // Upsert to tolerate the (owner_id, name) unique race.
      return this._single(
        this.db
          .from('save_collections')
          .upsert({ owner_id: ownerId, name: 'default' }, { onConflict: 'owner_id,name' })
          .select(SAVE_COLLECTION_COLS),
      );
    };
    const snapshot = async (row: SaveCollectionRow): Promise<SaveCollection> => {
      const posts = await this._many(
        this.db.from('saved_posts').select('post_id').eq('collection_id', row.id),
      );
      return mapSaveCollection(row, posts.map((p) => p.post_id));
    };
    return {
      getOrCreateDefault: async (ownerId) => snapshot(await defaultCollection(ownerId)),
      listForOwner: async (ownerId) => {
        const rows = await this._many(
          this.db.from('save_collections').select(SAVE_COLLECTION_COLS).eq('owner_id', ownerId),
        );
        return Promise.all(rows.map(snapshot));
      },
      savePost: async (ownerId, postId, collectionId) => {
        const collection = collectionId
          ? await this._maybeSingle(
              this.db.from('save_collections').select(SAVE_COLLECTION_COLS).eq('id', collectionId),
            )
          : await defaultCollection(ownerId);
        if (!collection) {
          throw new WearStoreError('collection_not_found', `Unknown collection ${collectionId}.`);
        }
        if (collection.owner_id !== ownerId) {
          throw new WearStoreError('forbidden', 'Collection does not belong to caller.');
        }
        const { error } = await this.db
          .from('saved_posts')
          .upsert(
            { collection_id: collection.id, post_id: postId },
            { onConflict: 'collection_id,post_id', ignoreDuplicates: true },
          );
        if (error) {
          if (error.code === '23503') throw new WearStoreError('post_not_found', `Unknown post ${postId}.`);
          throw wrap(error);
        }
        return snapshot(collection);
      },
      unsavePost: async (ownerId, postId, collectionId) => {
        if (collectionId) {
          const coll = await this._maybeSingle(
            this.db.from('save_collections').select('id,owner_id').eq('id', collectionId),
          );
          if (!coll || coll.owner_id !== ownerId) return;
          await this._run(
            this.db
              .from('saved_posts')
              .delete()
              .eq('collection_id', collectionId)
              .eq('post_id', postId),
          );
          return;
        }
        const owned = await this._many(
          this.db.from('save_collections').select('id').eq('owner_id', ownerId),
        );
        for (const c of owned) {
          await this._run(
            this.db.from('saved_posts').delete().eq('collection_id', c.id).eq('post_id', postId),
          );
        }
      },
      isSaved: async (ownerId, postId) => {
        const owned = await this._many(
          this.db.from('save_collections').select('id').eq('owner_id', ownerId),
        );
        if (!owned.length) return false;
        const row = await this._maybeSingle(
          this.db
            .from('saved_posts')
            .select('post_id')
            .eq('post_id', postId)
            .in(
              'collection_id',
              owned.map((c) => c.id),
            ),
        );
        return row !== null;
      },
    };
  }

  // ── Stories ───────────────────────────────────────────────────────────────
  private _stories(): StoryRepo {
    const DEFAULT_TTL = 1000 * 60 * 60 * 24;
    return {
      create: async (input: CreateStoryInput) => {
        const createdAt = this.now();
        const ttl = Math.max(1000, input.ttlMs ?? DEFAULT_TTL);
        const mediaKind = input.mediaKind ?? 'image';
        const caption = (input.caption ?? '').trim() || null;
        if (mediaKind === 'text' && !caption) {
          throw new WearStoreError('empty_story', 'Text stories must have a caption.');
        }
        if (mediaKind !== 'text' && !input.mediaUrl) {
          throw new WearStoreError('empty_story', 'Image/video stories must have a media url.');
        }
        const row = await this._single(
          this.db
            .from('stories')
            .insert({
              author_id: input.authorId,
              brand_id: input.brandId ?? null,
              media_url: input.mediaUrl ?? null,
              media_kind: mediaKind,
              caption,
              audience: input.audience ?? 'public',
              created_at: createdAt.toISOString(),
              expires_at: new Date(createdAt.getTime() + ttl).toISOString(),
            })
            .select(STORY_COLS),
        );
        return mapStory(row);
      },
      getById: async (id) => {
        const row = await this._maybeSingle(this.db.from('stories').select(STORY_COLS).eq('id', id));
        return row ? mapStory(row) : null;
      },
      listByAuthor: async (authorId) => {
        const rows = await this._many(
          this.db
            .from('stories')
            .select(STORY_COLS)
            .eq('author_id', authorId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapStory);
      },
      listActiveForViewer: async (viewerId) => {
        // RLS `stories_read` already enforces audience (author/public/followers)
        // AND block invisibility is handled by our tray/reaction paths; here we
        // additionally drop stories from users in a mutual block (mirrors memory)
        // and expired rows.
        const nowIso = this.now().toISOString();
        const rows = await this._many(
          this.db
            .from('stories')
            .select(STORY_COLS)
            .gt('expires_at', nowIso)
            .order('created_at', { ascending: false }),
        );
        const visible: Story[] = [];
        for (const r of rows) {
          if (r.author_id !== viewerId && (await this._isBlockedEither(viewerId, r.author_id))) continue;
          visible.push(mapStory(r));
        }
        return visible;
      },
      trayForViewer: async (viewerId) => {
        const active = await this.stories.listActiveForViewer(viewerId);
        const grouped = new Map<ConnectId, Story[]>();
        for (const s of active) {
          const list = grouped.get(s.authorId) ?? [];
          list.push(s);
          grouped.set(s.authorId, list);
        }
        const seen = await this._seenStoryIds(viewerId);
        const entries: StoryTrayEntry[] = [];
        for (const [authorId, list] of grouped.entries()) {
          const latest = list[0]!;
          const hasUnseen = list.some((s) => !seen.has(s.id) && s.authorId !== viewerId);
          entries.push({
            authorId,
            latestStoryId: latest.id,
            latestCreatedAt: latest.createdAt,
            storyCount: list.length,
            hasUnseen,
          });
        }
        return entries.sort((a, b) => {
          if (a.authorId === viewerId) return -1;
          if (b.authorId === viewerId) return 1;
          if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
          return Date.parse(b.latestCreatedAt) - Date.parse(a.latestCreatedAt);
        });
      },
      recordView: async (storyId, viewerId) => {
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        const nowIso = this.now().toISOString();
        if (story.author_id === viewerId) {
          return { storyId, viewerId, viewedAt: nowIso };
        }
        const existing = await this._maybeSingle(
          this.db
            .from('story_views')
            .select('story_id,viewer_id,viewed_at')
            .eq('story_id', storyId)
            .eq('viewer_id', viewerId),
        );
        if (existing) return mapStoryView(existing);
        const created = await this._single(
          this.db
            .from('story_views')
            .insert({ story_id: storyId, viewer_id: viewerId })
            .select('story_id,viewer_id,viewed_at'),
        );
        return mapStoryView(created);
      },
      listViewers: async (storyId, callerId) => {
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) return [];
        if (story.author_id !== callerId) {
          throw new WearStoreError('forbidden', 'Only the author can see story viewers.');
        }
        const rows = await this._many(
          this.db
            .from('story_views')
            .select('story_id,viewer_id,viewed_at')
            .eq('story_id', storyId)
            .order('viewed_at', { ascending: false }),
        );
        return rows.map(mapStoryView);
      },
      addReaction: async ({ storyId, userId, kind }) => {
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        if (await this._isBlockedEither(userId, story.author_id)) {
          throw new WearStoreError('forbidden', 'Cannot react to this story.');
        }
        const row = await this._single(
          this.db
            .from('story_reactions')
            .insert({ story_id: storyId, user_id: userId, kind })
            .select(STORY_REACTION_COLS),
        );
        return mapStoryReaction(row);
      },
      listReactions: async (storyId) => {
        const rows = await this._many(
          this.db
            .from('story_reactions')
            .select(STORY_REACTION_COLS)
            .eq('story_id', storyId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapStoryReaction);
      },
      delete: async (storyId, authorId) => {
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) return;
        if (story.author_id !== authorId) {
          throw new WearStoreError('forbidden', 'Only the author can delete this story.');
        }
        await this._run(this.db.from('stories').delete().eq('id', storyId));
      },
    };
  }

  // ── Highlights ────────────────────────────────────────────────────────────
  private _highlights(): HighlightRepo {
    const load = async (id: string): Promise<StoryHighlight | null> => {
      const row = await this._maybeSingle(
        this.db.from('story_highlights').select(HIGHLIGHT_COLS).eq('id', id),
      );
      if (!row) return null;
      const items = await this._many(
        this.db
          .from('story_highlight_items')
          .select('story_id,order_index')
          .eq('highlight_id', id)
          .order('order_index', { ascending: true }),
      );
      return mapHighlight(row, items.map((i) => i.story_id));
    };
    const requireOwned = async (id: string, ownerId: ConnectId): Promise<StoryHighlight> => {
      const h = await load(id);
      if (!h) throw new WearStoreError('highlight_not_found', `Unknown highlight ${id}.`);
      if (h.ownerId !== ownerId) {
        throw new WearStoreError('forbidden', 'Only the owner can modify this highlight.');
      }
      return h;
    };
    return {
      create: async ({ ownerId, name, coverUrl }) => {
        const trimmed = name.trim();
        if (!trimmed) throw new WearStoreError('empty_highlight', 'Highlight name must not be empty.');
        const row = await this._single(
          this.db
            .from('story_highlights')
            .insert({ owner_id: ownerId, name: trimmed.slice(0, 80), cover_url: coverUrl ?? null })
            .select(HIGHLIGHT_COLS),
        );
        return mapHighlight(row, []);
      },
      listForOwner: async (ownerId) => {
        const rows = await this._many(
          this.db
            .from('story_highlights')
            .select(HIGHLIGHT_COLS)
            .eq('owner_id', ownerId)
            .order('created_at', { ascending: false }),
        );
        const out: StoryHighlight[] = [];
        for (const r of rows) {
          const loaded = await load(r.id);
          if (loaded) out.push(loaded);
        }
        return out;
      },
      getById: async (id) => load(id),
      addStory: async (highlightId, storyId, ownerId) => {
        const highlight = await requireOwned(highlightId, ownerId);
        const story = await this._maybeSingle(
          this.db.from('stories').select('author_id').eq('id', storyId),
        );
        if (!story) throw new WearStoreError('story_not_found', `Unknown story ${storyId}.`);
        if (story.author_id !== ownerId) {
          throw new WearStoreError('forbidden', 'Highlights may only contain the owner’s own stories.');
        }
        if (highlight.storyIds.includes(storyId)) return highlight;
        await this._run(
          this.db.from('story_highlight_items').upsert(
            {
              highlight_id: highlightId,
              story_id: storyId,
              order_index: highlight.storyIds.length,
            },
            { onConflict: 'highlight_id,story_id', ignoreDuplicates: true },
          ),
        );
        return (await load(highlightId))!;
      },
      removeStory: async (highlightId, storyId, ownerId) => {
        await requireOwned(highlightId, ownerId);
        await this._run(
          this.db
            .from('story_highlight_items')
            .delete()
            .eq('highlight_id', highlightId)
            .eq('story_id', storyId),
        );
        return (await load(highlightId))!;
      },
      delete: async (highlightId, ownerId) => {
        await requireOwned(highlightId, ownerId);
        await this._run(this.db.from('story_highlights').delete().eq('id', highlightId));
      },
    };
  }

  // ── Conversations ─────────────────────────────────────────────────────────
  private _conversations(): ConversationRepo {
    const summarise = async (
      conv: ConversationRow,
      userId: ConnectId,
    ): Promise<ConversationSummary> => {
      const members = await this._many(
        this.db.from('conversation_members').select(MEMBER_COLS).eq('conversation_id', conv.id),
      );
      const messages = await this._many(
        this.db
          .from('messages')
          .select(MESSAGE_COLS)
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true }),
      );
      const me = members.find((m) => m.user_id === userId);
      const lastReadMs = me?.last_read_at ? Date.parse(me.last_read_at) : 0;
      const lastMessage = messages.length ? messages[messages.length - 1]! : null;
      const unreadCount = messages.filter(
        (m) => m.author_id !== userId && !m.deleted_at && Date.parse(m.created_at) > lastReadMs,
      ).length;
      return {
        conversation: mapConversation(conv),
        members: members.map(mapMember),
        lastMessage: lastMessage ? mapMessage(lastMessage) : null,
        unreadCount,
      };
    };
    return {
      getOrCreateDirect: async (actorId, otherId) => {
        if (actorId === otherId) throw new WearStoreError('self_dm', 'Cannot start a DM with yourself.');
        const conv = await this._rpcRow('create_direct_conversation', { p_other: otherId });
        return mapConversation(conv as ConversationRow);
      },
      createGroup: async ({ createdById: _createdById, name, memberIds }) => {
        // createdById is implied by auth.uid() inside the SECDEF helper.
        const conv = await this._rpcRow('create_group_conversation', {
          p_name: name,
          p_member_ids: [...memberIds],
        });
        return mapConversation(conv as ConversationRow);
      },
      getById: async (id, callerId) => {
        const conv = await this._maybeSingle(
          this.db.from('conversations').select(CONVERSATION_COLS).eq('id', id),
        );
        if (!conv) return null;
        const me = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', id)
            .eq('user_id', callerId),
        );
        if (!me) return null;
        return mapConversation(conv);
      },
      membership: async (conversationId, userId) => {
        const row = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .select(MEMBER_COLS)
            .eq('conversation_id', conversationId)
            .eq('user_id', userId),
        );
        return row ? mapMember(row) : null;
      },
      listMembers: async (conversationId) => {
        const rows = await this._many(
          this.db
            .from('conversation_members')
            .select(MEMBER_COLS)
            .eq('conversation_id', conversationId),
        );
        return rows.map(mapMember);
      },
      listForUser: async (userId, options) => {
        let mine = this.db
          .from('conversation_members')
          .select('conversation_id,request_state')
          .eq('user_id', userId);
        if (options?.requestState) mine = mine.eq('request_state', options.requestState);
        const memberships = await this._many(mine);
        if (!memberships.length) return [];
        const convs = await this._many(
          this.db
            .from('conversations')
            .select(CONVERSATION_COLS)
            .in(
              'id',
              memberships.map((m) => m.conversation_id),
            ),
        );
        const summaries = await Promise.all(convs.map((c) => summarise(c, userId)));
        return summaries.sort((a, b) => {
          const aTs = a.lastMessage?.createdAt ?? a.conversation.updatedAt;
          const bTs = b.lastMessage?.createdAt ?? b.conversation.updatedAt;
          return Date.parse(bTs) - Date.parse(aTs);
        });
      },
      markRead: async (conversationId, userId) => {
        await this._run(
          this.db
            .from('conversation_members')
            .update({ last_read_at: this.now().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId),
        );
      },
      acceptRequest: async (conversationId, userId) => {
        const updated = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .update({ request_state: 'accepted' })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .select(MEMBER_COLS),
        );
        if (!updated) throw new WearStoreError('not_a_member', 'No membership found.');
        return mapMember(updated);
      },
      declineRequest: async (conversationId, userId) => {
        await this._run(
          this.db
            .from('conversation_members')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', userId),
        );
      },
      setMuted: async (conversationId, userId, mutedUntil) => {
        const updated = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .update({ muted_until: mutedUntil })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .select(MEMBER_COLS),
        );
        if (!updated) throw new WearStoreError('not_a_member', 'No membership found.');
        return mapMember(updated);
      },
      leave: async (conversationId, userId) => {
        await this._run(
          this.db
            .from('conversation_members')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', userId),
        );
      },
    };
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  private _messages(): MessageRepo {
    return {
      send: async ({ conversationId, authorId, body }) => {
        const me = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .select('request_state')
            .eq('conversation_id', conversationId)
            .eq('user_id', authorId),
        );
        if (!me) throw new WearStoreError('forbidden', 'Not a member of this conversation.');
        const conv = await this._maybeSingle(
          this.db.from('conversations').select('created_by').eq('id', conversationId),
        );
        if (!conv) throw new WearStoreError('conversation_not_found', `Unknown ${conversationId}.`);
        if (me.request_state !== 'accepted' && conv.created_by !== authorId) {
          throw new WearStoreError('request_pending', 'Accept the request before replying.');
        }
        const trimmed = body.trim();
        if (!trimmed) throw new WearStoreError('empty_message', 'Message body must not be empty.');
        const others = await this._many(
          this.db
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', authorId),
        );
        for (const m of others) {
          if (await this._isBlockedEither(authorId, m.user_id)) {
            throw new WearStoreError('forbidden', 'Cannot message a user you have blocked.');
          }
        }
        // The conversation.updated_at bump is handled by the mig-144 trigger.
        const row = await this._single(
          this.db
            .from('messages')
            .insert({ conversation_id: conversationId, author_id: authorId, body: trimmed.slice(0, 4000) })
            .select(MESSAGE_COLS),
        );
        return mapMessage(row);
      },
      list: async (conversationId, callerId, params) => {
        const me = await this._maybeSingle(
          this.db
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', callerId),
        );
        if (!me) throw new WearStoreError('forbidden', 'Not a member of this conversation.');
        const all = await this._many(
          this.db
            .from('messages')
            .select(MESSAGE_COLS)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true }),
        );
        const limit = clamp(params?.limit ?? 50, 1, 100);
        const start = parseCursor(params?.cursor);
        const slice = all.slice(start, start + limit);
        const nextIndex = start + slice.length;
        return {
          items: slice.map(mapMessage),
          nextCursor: nextIndex < all.length ? String(nextIndex) : null,
        };
      },
      deleteOwn: async (messageId, callerId) => {
        const m = await this._maybeSingle(
          this.db.from('messages').select('author_id').eq('id', messageId),
        );
        if (!m) return;
        if (m.author_id !== callerId) {
          throw new WearStoreError('forbidden', 'Only the author can delete this message.');
        }
        await this._run(
          this.db
            .from('messages')
            .update({ deleted_at: this.now().toISOString(), body: '' })
            .eq('id', messageId),
        );
      },
    };
  }

  // ── Blocks ────────────────────────────────────────────────────────────────
  private _blocks(): BlockRepo {
    return {
      block: async (actorId, targetId) => {
        if (actorId === targetId) throw new WearStoreError('self_block', 'A user cannot block themselves.');
        const existing = await this._maybeSingle(
          this.db
            .from('blocks')
            .select('actor_id,target_id,created_at')
            .eq('actor_id', actorId)
            .eq('target_id', targetId),
        );
        if (existing) return mapBlock(existing);
        // The mig-144 trigger removes both follow directions on insert.
        const created = await this._single(
          this.db
            .from('blocks')
            .insert({ actor_id: actorId, target_id: targetId })
            .select('actor_id,target_id,created_at'),
        );
        return mapBlock(created);
      },
      unblock: async (actorId, targetId) => {
        await this._run(
          this.db.from('blocks').delete().eq('actor_id', actorId).eq('target_id', targetId),
        );
      },
      isBlockedEither: async (a, b) => this._isBlockedEither(a, b),
      listBlocked: async (actorId) => {
        const rows = await this._many(
          this.db.from('blocks').select('actor_id,target_id,created_at').eq('actor_id', actorId),
        );
        return rows.map(mapBlock);
      },
    };
  }

  // ── Reports ───────────────────────────────────────────────────────────────
  private _reports(): ReportRepo {
    return {
      create: async ({ reporterId, subjectKind, subjectId, reason, note }) => {
        const trimmed = (note ?? '').trim();
        const row = await this._single(
          this.db
            .from('reports')
            .insert({
              reporter_id: reporterId,
              subject_kind: subjectKind,
              subject_id: subjectId,
              reason,
              note: trimmed ? trimmed.slice(0, 2000) : null,
            })
            .select(REPORT_COLS),
        );
        return mapReport(row);
      },
      // reports is service_role-read-only (no select policy) — these throw for
      // an ordinary user, which is the intended posture (moderation backend only).
      listForSubject: async (subjectKind, subjectId) => {
        const rows = await this._many(
          this.db
            .from('reports')
            .select(REPORT_COLS)
            .eq('subject_kind', subjectKind)
            .eq('subject_id', subjectId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapReport);
      },
      listByReporter: async (reporterId) => {
        const rows = await this._many(
          this.db
            .from('reports')
            .select(REPORT_COLS)
            .eq('reporter_id', reporterId)
            .order('created_at', { ascending: false }),
        );
        return rows.map(mapReport);
      },
    };
  }

  // ── Shared internals ──────────────────────────────────────────────────────
  private async _isBlockedEither(a: ConnectId, b: ConnectId): Promise<boolean> {
    const { data, error } = await this.db.rpc('is_blocked_either', { p_a: a, p_b: b });
    if (error) throw wrap(error);
    return Boolean(data);
  }

  private async _followedPlusSelf(viewerId: ConnectId): Promise<ConnectId[]> {
    const rows = await this._many(
      this.db.from('follows').select('target_id').eq('actor_id', viewerId),
    );
    return [viewerId, ...rows.map((r) => r.target_id)];
  }

  private async _seenStoryIds(viewerId: ConnectId): Promise<Set<string>> {
    const rows = await this._many(
      this.db.from('story_views').select('story_id').eq('viewer_id', viewerId),
    );
    return new Set(rows.map((r) => r.story_id));
  }

  private async _attachMedia(posts: readonly PostRow[]): Promise<PostWithMedia[]> {
    if (!posts.length) return [];
    const media = await this._many(
      this.db
        .from('post_media')
        .select(MEDIA_COLS)
        .in(
          'post_id',
          posts.map((p) => p.id),
        ),
    );
    const byPost = new Map<string, MediaRow[]>();
    for (const m of media) {
      const list = byPost.get(m.post_id) ?? [];
      list.push(m);
      byPost.set(m.post_id, list);
    }
    return posts.map((p) => ({
      post: mapPost(p),
      media: (byPost.get(p.id) ?? [])
        .sort((a, b) => a.order_index - b.order_index)
        .map(mapMedia),
    }));
  }

  // ── PostgREST plumbing ────────────────────────────────────────────────────
  private async _maybeSingle<T>(builder: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T | null> {
    const { data, error } = await builder;
    if (error) throw wrap(error);
    return data && data.length ? data[0]! : null;
  }

  private async _single<T>(builder: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T> {
    const row = await this._maybeSingle(builder);
    if (!row) throw new WearStoreError('not_found', 'Expected exactly one row.');
    return row;
  }

  private async _many<T>(builder: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
    const { data, error } = await builder;
    if (error) throw wrap(error);
    return data ?? [];
  }

  private async _run(builder: PromiseLike<{ error: PostgrestError | null }>): Promise<void> {
    const { error } = await builder;
    if (error) throw wrap(error);
  }

  private async _count(
    builder: PromiseLike<{ count: number | null; error: PostgrestError | null }>,
  ): Promise<number> {
    const { count, error } = await builder;
    if (error) throw wrap(error);
    return count ?? 0;
  }

  private async _rpcRow(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw mapRpcError(error);
    return data;
  }

  private async _pageFrom<TRow, TOut>(
    builder: PostgrestPageBuilder<TRow>,
    params: PageParams | undefined,
    map: (row: TRow) => TOut,
  ): Promise<Page<TOut>> {
    const start = parseCursor(params?.cursor);
    const limit = clamp(params?.limit ?? 20, 1, 100);
    const { data, error } = await builder.range(start, start + limit); // limit+1 rows
    if (error) throw wrap(error);
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(map);
    return { items, nextCursor: hasMore ? String(start + limit) : null };
  }
}

/**
 * Build a request-scoped `SupabaseWearStore` from an already `wear`-scoped
 * server client (see `createWearServerClient`). Kept separate so callers that
 * degrade to `MemoryWearStore` when Supabase is unconfigured own that branch.
 */
export function createSupabaseWearStore(
  client: SupabaseClient,
  options?: { readonly now?: () => Date },
): SupabaseWearStore {
  return new SupabaseWearStore(client, options);
}

// ── Types + mappers (snake_case row → camelCase domain) ─────────────────────
type PostgrestPageBuilder<TRow> = PromiseLike<{ data: TRow[] | null; error: PostgrestError | null }> & {
  range(from: number, to: number): PromiseLike<{ data: TRow[] | null; error: PostgrestError | null }>;
};

const USER_COLS = 'id,handle,display_name,avatar_url,created_at,updated_at';
const BRAND_COLS =
  'id,slug,name,tagline,website_url,logo_url,verified,owner_user_id,connect_contributor_id,created_at,updated_at';
const PROFILE_COLS = 'user_id,bio,visibility,verified,created_at,updated_at';
const SETTINGS_COLS =
  'user_id,display_name_override,profile_visibility,created_at,updated_at';
const POST_COLS = 'id,author_id,brand_id,body,tagged_product_ids,created_at,updated_at';
const MEDIA_COLS = 'id,post_id,url,kind,alt_text,order_index';
const COMMENT_COLS = 'id,post_id,author_id,parent_comment_id,body,created_at';
const SAVE_COLLECTION_COLS = 'id,owner_id,name,created_at';
const STORY_COLS =
  'id,author_id,brand_id,media_url,media_kind,caption,audience,created_at,expires_at';
const STORY_REACTION_COLS = 'id,story_id,user_id,kind,created_at';
const HIGHLIGHT_COLS = 'id,owner_id,name,cover_url,created_at';
const CONVERSATION_COLS = 'id,kind,name,created_by,created_at,updated_at';
const MEMBER_COLS =
  'conversation_id,user_id,joined_at,last_read_at,muted_until,request_state,role';
const MESSAGE_COLS = 'id,conversation_id,author_id,body,created_at,deleted_at';
const REPORT_COLS = 'id,reporter_id,subject_kind,subject_id,reason,note,created_at';

const FOR_YOU_CANDIDATES = 500;
const TRENDING_CANDIDATES = 1000;

interface UserRow {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
interface BrandRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  website_url: string | null;
  logo_url: string | null;
  verified: boolean;
  owner_user_id: string;
  connect_contributor_id: string | null;
  created_at: string;
  updated_at: string;
}
interface ProfileRow {
  user_id: string;
  bio: string | null;
  visibility: Profile['visibility'];
  verified: boolean;
  created_at: string;
  updated_at: string;
}
interface SettingsRow {
  user_id: string;
  display_name_override: string | null;
  profile_visibility: UserSettings['profileVisibility'];
  created_at: string;
  updated_at: string;
}
interface PostRow {
  id: string;
  author_id: string;
  brand_id: string | null;
  body: string;
  tagged_product_ids: string[] | null;
  created_at: string;
  updated_at: string;
}
interface MediaRow {
  id: string;
  post_id: string;
  url: string;
  kind: PostMedia['kind'];
  alt_text: string | null;
  order_index: number;
}
interface LikeRow {
  post_id: string;
  user_id: string;
  created_at: string;
}
interface CommentLikeRow {
  comment_id: string;
  user_id: string;
  created_at: string;
}
interface CommentRow {
  id: string;
  post_id: string;
  author_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
}
interface SaveCollectionRow {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}
interface StoryRow {
  id: string;
  author_id: string;
  brand_id: string | null;
  media_url: string | null;
  media_kind: Story['mediaKind'];
  caption: string | null;
  audience: Story['audience'];
  created_at: string;
  expires_at: string;
}
interface StoryViewRow {
  story_id: string;
  viewer_id: string;
  viewed_at: string;
}
interface StoryReactionRow {
  id: string;
  story_id: string;
  user_id: string;
  kind: StoryReactionKind;
  created_at: string;
}
interface HighlightRow {
  id: string;
  owner_id: string;
  name: string;
  cover_url: string | null;
  created_at: string;
}
interface ConversationRow {
  id: string;
  kind: Conversation['kind'];
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
interface MemberRow {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
  muted_until: string | null;
  request_state: ConversationRequestState;
  role: ConversationMember['role'];
}
interface MessageRow {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
}
interface ReportRow {
  id: string;
  reporter_id: string;
  subject_kind: Report['subjectKind'];
  subject_id: string;
  reason: Report['reason'];
  note: string | null;
  created_at: string;
}

const mapUser = (r: UserRow): WearUser => ({
  id: r.id,
  handle: r.handle,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapBrand = (r: BrandRow): WearBrand => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  tagline: r.tagline,
  websiteUrl: r.website_url,
  logoUrl: r.logo_url,
  verified: r.verified,
  ownerUserId: r.owner_user_id,
  connectContributorId: r.connect_contributor_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapProfile = (r: ProfileRow): Profile => ({
  userId: r.user_id,
  bio: r.bio,
  visibility: r.visibility,
  verified: r.verified,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapSettings = (r: SettingsRow): UserSettings => ({
  userId: r.user_id,
  displayNameOverride: r.display_name_override,
  profileVisibility: r.profile_visibility,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapFollow = (r: { actor_id: string; target_id: string; created_at: string }): FollowEdge => ({
  actorId: r.actor_id,
  targetId: r.target_id,
  createdAt: r.created_at,
});
const mapPost = (r: PostRow): Post => ({
  id: r.id,
  authorId: r.author_id,
  brandId: r.brand_id,
  body: r.body,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  taggedProductIds: r.tagged_product_ids ?? [],
});
const mapMedia = (r: MediaRow): PostMedia => ({
  id: r.id,
  postId: r.post_id,
  url: r.url,
  kind: r.kind,
  altText: r.alt_text,
  orderIndex: r.order_index,
});
const mapLike = (r: LikeRow): LikeEdge => ({
  postId: r.post_id,
  userId: r.user_id,
  createdAt: r.created_at,
});
const mapCommentLike = (r: CommentLikeRow) => ({
  commentId: r.comment_id,
  userId: r.user_id,
  createdAt: r.created_at,
});
const mapComment = (r: CommentRow): Comment => ({
  id: r.id,
  postId: r.post_id,
  authorId: r.author_id,
  parentCommentId: r.parent_comment_id,
  body: r.body,
  createdAt: r.created_at,
});
const mapSaveCollection = (r: SaveCollectionRow, postIds: string[]): SaveCollection => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  createdAt: r.created_at,
  postIds,
});
const mapStory = (r: StoryRow): Story => ({
  id: r.id,
  authorId: r.author_id,
  brandId: r.brand_id,
  mediaUrl: r.media_url,
  mediaKind: r.media_kind,
  caption: r.caption,
  audience: r.audience,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});
const mapStoryView = (r: StoryViewRow): StoryView => ({
  storyId: r.story_id,
  viewerId: r.viewer_id,
  viewedAt: r.viewed_at,
});
const mapStoryReaction = (r: StoryReactionRow): StoryReaction => ({
  id: r.id,
  storyId: r.story_id,
  userId: r.user_id,
  kind: r.kind,
  createdAt: r.created_at,
});
const mapHighlight = (r: HighlightRow, storyIds: string[]): StoryHighlight => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  coverUrl: r.cover_url,
  createdAt: r.created_at,
  storyIds,
});
const mapConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  createdById: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const mapMember = (r: MemberRow): ConversationMember => ({
  conversationId: r.conversation_id,
  userId: r.user_id,
  joinedAt: r.joined_at,
  lastReadAt: r.last_read_at,
  mutedUntil: r.muted_until,
  requestState: r.request_state,
  role: r.role,
});
const mapMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  authorId: r.author_id,
  body: r.body,
  createdAt: r.created_at,
  deletedAt: r.deleted_at,
});
const mapBlock = (r: { actor_id: string; target_id: string; created_at: string }): BlockEdge => ({
  actorId: r.actor_id,
  targetId: r.target_id,
  createdAt: r.created_at,
});
const mapReport = (r: ReportRow): Report => ({
  id: r.id,
  reporterId: r.reporter_id,
  subjectKind: r.subject_kind,
  subjectId: r.subject_id,
  reason: r.reason,
  note: r.note,
  createdAt: r.created_at,
});

// ── small helpers ───────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseCursor(cursor?: string): number {
  const start = cursor ? Number.parseInt(cursor, 10) : 0;
  if (Number.isNaN(start) || start < 0) {
    throw new WearStoreError('invalid_cursor', `Invalid cursor: ${cursor ?? ''}`);
  }
  return start;
}

/** Escape PostgREST `like`/`ilike` wildcards in user input. */
function escapeLike(input: string): string {
  return input.replace(/[%_,()]/g, (c) => `\\${c}`);
}

function wrap(error: PostgrestError): WearStoreError {
  return new WearStoreError(error.code || 'db_error', error.message);
}

/**
 * Map a SECDEF-RPC `raise exception … using errcode` to the same
 * `WearStoreError` codes MemoryWearStore throws, so callers are storage-agnostic.
 */
function mapRpcError(error: PostgrestError): WearStoreError {
  const msg = error.message || '';
  const known = [
    'unauthorized',
    'self_dm',
    'forbidden',
    'empty_group_name',
    'group_too_small',
  ];
  const code = known.find((k) => msg.includes(k)) ?? error.code ?? 'rpc_error';
  return new WearStoreError(code, msg);
}
