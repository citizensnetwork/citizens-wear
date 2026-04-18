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

/** The full Wear data surface. */
export interface WearStore {
  readonly profiles: ProfileRepo;
  readonly follows: FollowRepo;
  readonly settings: SettingsRepo;
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
