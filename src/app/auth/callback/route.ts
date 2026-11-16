import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';

/**
 * Route handler for Supabase Authentication Callback (PKCE and OTP verification).
 * This endpoint handles:
 *  - PKCE auth code exchange (?code=...)
 *  - OTP token hash verification (?token_hash=...&type=signup|recovery|email_change)
 *  - Supabase error redirects (?error=...&error_description=...)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';
  const error = searchParams.get('error');
  const error_description = searchParams.get('error_description');

  // Handle explicit Supabase error redirects (e.g. expired link)
  if (error || error_description) {
    const errorMsg = encodeURIComponent(
      error_description || error || 'Authentication link error'
    );
    return NextResponse.redirect(`${origin}/login?error=${errorMsg}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase credentials are configured, exchange the code/hash
  if (url && anonKey && !url.includes('placeholder')) {
    let response = NextResponse.redirect(new URL(next, origin));

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.redirect(new URL(next, origin));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    // 1. PKCE code exchange flow
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (!exchangeError) {
        return response;
      }
      console.error('Auth code exchange error:', exchangeError.message);
    }

    // 2. Token hash (OTP) verification flow
    if (token_hash && type) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      });
      if (!verifyError) {
        return response;
      }
      console.error('OTP verification error:', verifyError.message);
    }
  }

  // If code was provided but failed, show error on login page
  if (code || token_hash) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('The confirmation link is invalid, expired, or has already been used. Please try signing in.')}`
    );
  }

  // Fallback: If visited without code/token_hash, redirect to login with confirmed banner
  return NextResponse.redirect(`${origin}/login?confirmed=true`);
}
