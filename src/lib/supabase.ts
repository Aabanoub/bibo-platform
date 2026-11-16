import { createBrowserClient } from '@supabase/ssr';

let cachedBrowserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Creates or retrieves the singleton Supabase browser client for use across Client Components.
 * Uses @supabase/ssr createBrowserClient to automatically handle PKCE auth, sessions,
 * and cookies synchronized with Next.js middleware.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  if (typeof window === 'undefined') {
    return createBrowserClient(url, anonKey);
  }

  if (!cachedBrowserClient) {
    cachedBrowserClient = createBrowserClient(url, anonKey);
  }

  return cachedBrowserClient;
}

// Deprecated beta helper cleanup functions to maintain backward compatibility
export function clearStoredBetaUser() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('abanoub_beta_user');
    document.cookie = 'abanoub_beta_user=; path=/; max-age=0; SameSite=Lax';
  }
}
export function setStoredBetaUser(_user: any) {}
export function getStoredBetaUser() {
  return null;
}
