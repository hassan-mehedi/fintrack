import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const publicRoutes = ["/", "/login", "/register"];
const publicApiPrefixes = ["/api/auth", "/api/register"];
const isDev = process.env.NODE_ENV !== "production";

function generateNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const value = String.fromCharCode(...bytes);

  return btoa(value);
}

function buildContentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' https://api.openai.com https://*.upstash.io${isDev ? " ws: wss:" : ""}`,
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(!isDev ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isApiRoute = nextUrl.pathname.startsWith("/api");
  const isPublicApi = publicApiPrefixes.some((prefix) =>
    nextUrl.pathname.startsWith(prefix),
  );
  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(req.headers);

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Allow public API routes through without auth
  if (isApiRoute && isPublicApi) {
    return applySecurityHeaders(
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
      csp,
    );
  }

  // Block unauthenticated requests to protected API routes
  if (isApiRoute && !isLoggedIn) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      csp,
    );
  }

  // Redirect logged-in users away from public pages to dashboard
  if (isLoggedIn && isPublicRoute) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/dashboard", req.url)),
      csp,
    );
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn && !isPublicRoute) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/login", req.url)),
      csp,
    );
  }

  return applySecurityHeaders(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
    csp,
  );
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.svg$|.*\\.webp$|.*\\.ico$).*)"],
};
