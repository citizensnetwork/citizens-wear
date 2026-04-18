import type { ConnectId, IsoDateTime } from './contract';

/**
 * Phase 6 — realtime seam.
 *
 * Citizens Wear ships realtime as an *interface* in this phase, with an
 * in-memory adapter that fans out events inside a single Node process. This
 * is enough to exercise the contract from server actions and from
 * server-rendered pages that poll. A real broker (Redis pub/sub, NATS, a
 * managed service) lands in Phase 9; it must satisfy this same `RealtimeBus`
 * surface so callers do not change.
 *
 * Design notes:
 *   - Topics are scoped strings (`"conv:cnv_001"`, `"user:usr_001"`,
 *     `"story:sty_001"`). Subscribers MUST filter by topic; the bus does no
 *     access control.
 *   - Events are append-only, immutable, and carry their own timestamp.
 *   - `RealtimeEvent` is a closed union so consumers get exhaustiveness on
 *     `event.kind`. Adding a new kind is intentionally a breaking change.
 */

export type RealtimeTopic =
  | `conv:${string}`
  | `user:${ConnectId}`
  | `story:${string}`;

export type RealtimeEvent =
  | {
      readonly kind: 'message.created';
      readonly conversationId: string;
      readonly messageId: string;
      readonly authorId: ConnectId;
      readonly at: IsoDateTime;
    }
  | {
      readonly kind: 'message.deleted';
      readonly conversationId: string;
      readonly messageId: string;
      readonly at: IsoDateTime;
    }
  | {
      readonly kind: 'conversation.read';
      readonly conversationId: string;
      readonly userId: ConnectId;
      readonly at: IsoDateTime;
    }
  | {
      readonly kind: 'conversation.typing';
      readonly conversationId: string;
      readonly userId: ConnectId;
      readonly at: IsoDateTime;
    }
  | {
      readonly kind: 'story.posted';
      readonly storyId: string;
      readonly authorId: ConnectId;
      readonly at: IsoDateTime;
    }
  | {
      readonly kind: 'story.reaction';
      readonly storyId: string;
      readonly userId: ConnectId;
      readonly at: IsoDateTime;
    };

export type RealtimeListener = (event: RealtimeEvent) => void;

export interface RealtimeUnsubscribe {
  (): void;
}

export interface RealtimeBus {
  publish(topic: RealtimeTopic, event: RealtimeEvent): void;
  subscribe(topic: RealtimeTopic, listener: RealtimeListener): RealtimeUnsubscribe;
}

/**
 * Single-process in-memory bus. Suitable for development, tests, and a
 * single-node deployment. Listener errors are isolated per-listener so a
 * faulty subscriber cannot starve the rest.
 */
export class MemoryRealtimeBus implements RealtimeBus {
  private readonly _listeners = new Map<string, Set<RealtimeListener>>();

  public publish(topic: RealtimeTopic, event: RealtimeEvent): void {
    const set = this._listeners.get(topic);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch {
        // Swallow: a broken listener must not break the bus.
      }
    }
  }

  public subscribe(topic: RealtimeTopic, listener: RealtimeListener): RealtimeUnsubscribe {
    let set = this._listeners.get(topic);
    if (!set) {
      set = new Set();
      this._listeners.set(topic, set);
    }
    set.add(listener);
    return () => {
      const current = this._listeners.get(topic);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this._listeners.delete(topic);
    };
  }
}
