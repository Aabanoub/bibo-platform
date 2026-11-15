import { createBrowserClient } from "@supabase/ssr";

/**
 * Create a Supabase client for use in browser / Client Components.
 *
 * The client reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * from the environment at call-time so it works with both static and dynamic
 * rendering.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  return createBrowserClient(url, anonKey);
}
