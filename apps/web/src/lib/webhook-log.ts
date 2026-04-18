import type { DeliveryLog } from '@citizens-wear/connect-client';
import { MemoryDeliveryLog } from '@citizens-wear/connect-client';

/**
 * Process-local idempotency log for Connect webhook deliveries.
 *
 * Phase 3 uses an in-memory log — single-instance deployments only. Phase 9
 * will back this with Redis or Postgres so replayed deliveries stay
 * deduplicated across a horizontally-scaled fleet.
 */
let _log: DeliveryLog | undefined;

export function getDeliveryLog(): DeliveryLog {
  if (!_log) {
    _log = new MemoryDeliveryLog();
  }
  return _log;
}
