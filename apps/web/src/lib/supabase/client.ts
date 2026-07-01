import { createBrowserClient } from '@supabase/ssr';
import { requireSupabaseEnv } from './env';

/**
 * Browser Supabase client for Client Components (auth-state listeners,
 * client-initiated OAuth, realtime subscriptions). Uses the anon key and the
 * user's cookies; RLS still gates every request.
 */
export function createBrowserSupabaseClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
