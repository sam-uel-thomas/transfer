import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before the uploader-only pages. It refreshes the Supabase session
 * cookie (Server Components cannot write cookies) and bounces anyone who is
 * not the allowed uploader to /login.
 *
 * This is a convenience, not the security boundary: every page and API route
 * verifies the session and ALLOWED_EMAIL again on the server.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  // Not configured yet: let the page render and report the missing variable.
  if (!url || !anonKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    // Keep in step with SESSION_COOKIE_OPTIONS in lib/supabase/server.ts.
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email;
  const allowed =
    typeof email === "string" &&
    email.trim().toLowerCase() === process.env.ALLOWED_EMAIL?.trim().toLowerCase();

  const { pathname } = request.nextUrl;
  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Keep any refreshed session cookies on the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (pathname === "/login") return allowed ? redirectTo("/") : response;
  return allowed ? response : redirectTo("/login");
}

export const config = {
  matcher: ["/", "/transfers/:path*", "/login"],
};
