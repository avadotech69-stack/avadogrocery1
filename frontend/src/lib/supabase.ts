import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { apiUrl } from './api';

let clientPromise: Promise<SupabaseClient | null> | null = null;
let cachedClient: SupabaseClient | null = null;

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;
  if (!clientPromise) {
    clientPromise = fetch(apiUrl('/api/config'))
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg: { supabaseUrl?: string; supabaseAnonKey?: string } | null) => {
        if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) return null;
        cachedClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        });
        return cachedClient;
      })
      .catch(() => null);
  }
  return clientPromise;
}
