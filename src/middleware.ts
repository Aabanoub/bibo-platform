import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js middleware that:
 *   1. Refreshes the Supabase auth session on every request (keeps cookies
 *      in sync with the Supabase JWT lifecycle).
 *   2. Redirects unauthenticated users to /login for all protected routes.
 */
export async function middleware(request: NextRequest) {
  // Start with a plain "next" response so we can read/write cookies on it.
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          // Mirror cookies onto the request (so downstream server code sees them)
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          // Also set them on the outgoing response so the browser stores them
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh the session — MUST be called so the auth token stays valid.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {}

  const betaCookie = request.cookies.get("abanoub_beta_user");
  const isAuthenticated = !!user || !!betaCookie?.value;

  // If there is no authenticated user and the path is protected, redirect.
  const { pathname } = request.nextUrl;

  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/auth/callback" ||
    pathname === "/auth/confirm" ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    pathname === "/icon.svg" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/static/") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/.test(pathname);

  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}

/**
 * Run the middleware on every route except Next.js internals and static files
 * that are already excluded above (belt-and-suspenders).
 */
export const config = {
  matcher: [
    /*
     * Match all paths except:
     *   - _next/static  (static files)
     *   - _next/image   (image optimization)
     *   - favicon.ico   (browser favicon)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
