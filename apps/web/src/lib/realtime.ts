import { MemoryRealtimeBus } from '@citizens-wear/db';
import type { RealtimeBus } from '@citizens-wear/db';

/**
 * Single app-wide `RealtimeBus` instance. Mirrors the singleton pattern used
 * for `WearStore`. In development and tests this is the in-process memory
 * adapter; Phase 9 will swap it for a broker-backed implementation that
 * publishes across nodes.
 */
let _bus: RealtimeBus | undefined;

export function getRealtimeBus(): RealtimeBus {
  if (!_bus) {
    _bus = new MemoryRealtimeBus();
  }
  return _bus;
}

/** Test-only: reset the singleton. */
export function __resetRealtimeBusForTests(): void {
  _bus = undefined;
}
