import type {
  ConnectId,
  FollowCounts,
  FollowEdge,
  FollowRepo,
  Profile,
  ProfileRepo,
  SettingsRepo,
  UserSettings,
  WearStore,
} from './contract';
import { WearStoreError } from './contract';

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
}

export class MemoryWearStore implements WearStore {
  public readonly profiles: ProfileRepo;
  public readonly follows: FollowRepo;
  public readonly settings: SettingsRepo;

  private readonly _now: () => Date;
  private readonly _profiles = new Map<ConnectId, Profile>();
  private readonly _settings = new Map<ConnectId, UserSettings>();
  /** Keyed by `${actorId}->${targetId}`. */
  private readonly _follows = new Map<string, FollowEdge>();

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
  }
}

function edgeKey(actorId: ConnectId, targetId: ConnectId): string {
  return `${actorId}->${targetId}`;
}
