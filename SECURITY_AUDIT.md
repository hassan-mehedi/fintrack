# FinTrack Security Audit Report

**Date:** 2026-03-22
**Overall Rating:** 7.5/10 — Good foundation, several areas need attention

### Fixes Applied

- [x] **flatted** prototype pollution — fixed via `npm audit fix`
- [x] **Next.js** upgraded to latest — fixes CSRF bypass, request smuggling, DoS vulnerabilities
- [x] **Security headers** added to `next.config.ts` (X-Frame-Options, HSTS, Referrer-Policy, etc.)
- [x] **Rate limiting** added to registration (5 req/min per IP) and login (10 req/min per email)
- [x] **Password policy** strengthened to 8+ chars with uppercase, lowercase, number, and special character
- [x] **JWT session lifetime** reduced from 30 days to 1 day
- [x] **Rate limiter** upgraded to Upstash Redis with in-memory fallback for serverless compatibility
- [x] **Prompt injection guardrails** hardened with Unicode normalization, zero-width char stripping, expanded patterns, and structural heuristics
- [x] **Middleware API auth** — `/api` routes now protected at middleware level; unauthenticated requests get 401 before reaching handlers
- [x] **Error logging sanitized** — `console.error` in register route now logs only `error.message`, not full objects with user data
- [x] **Request body size limits** — all JSON API routes reject payloads over 100KB (HTTP 413) before parsing

---

## CRITICAL — Known Dependency Vulnerabilities (6 total)

`npm audit` found **6 vulnerabilities** (5 moderate, 1 high):

| Package | Severity | Issue | Fix |
|---------|----------|-------|-----|
| **flatted ≤3.4.1** | **HIGH** | Prototype Pollution via `parse()` | `npm audit fix` |
| **next 16.1.6** | MODERATE | CSRF bypass on Server Actions (null origin) | Upgrade to `next@16.2.1` |
| **next 16.1.6** | MODERATE | HTTP request smuggling in rewrites | Upgrade to `next@16.2.1` |
| **next 16.1.6** | MODERATE | Unbounded image disk cache growth (DoS) | Upgrade to `next@16.2.1` |
| **next 16.1.6** | MODERATE | Unbounded postponed resume buffering (DoS) | Upgrade to `next@16.2.1` |
| **esbuild ≤0.24.2** | MODERATE | Dev server CORS/XSS (via drizzle-kit) | Requires breaking drizzle-kit update |

The Next.js CSRF bypass is especially important for a financial app — a null `Origin` header can bypass Server Actions CSRF checks.

**Fix:** `npm audit fix` for flatted, then `npm install next@latest` for the Next.js issues.

---

## HIGH — Missing Security Headers

`next.config.ts` is completely empty — no security headers configured at all.

**Missing headers:**

- `Content-Security-Policy` — prevents XSS
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — restricts browser features
- `Strict-Transport-Security` — enforces HTTPS

**Recommended fix in `next.config.ts`:**

```typescript
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
```

---

## HIGH — No Rate Limiting on Auth Endpoints

| Endpoint | Rate Limiting |
|----------|---------------|
| `/api/chat` | 20 req/min |
| `/api/transcribe` | 10 req/min |
| `/api/translate` | 10 req/min |
| **`/api/register`** | **NONE** |
| **Login (NextAuth)** | **NONE** |

The login and registration endpoints are completely unprotected against brute force attacks. For a financial application, this is a significant risk.

**Recommendation:** Add rate limiting based on IP address:

```typescript
const authLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 60_000, // 1 minute
});
```

---

## HIGH — Weak Password Policy

From `lib/validators.ts`:

```typescript
password: z.string().min(6, "Password must be at least 6 characters")
```

A 6-character minimum with no complexity requirements is weak for a financial application.

**Recommendation:** Minimum 8-12 characters with mixed case, numbers, and symbols.

---

## MEDIUM — No JWT Token Revocation

The app uses JWT sessions (stateless). Once issued, a token cannot be invalidated until it expires. If a token is compromised, there's no way to revoke it.

**Recommendation:**

- Shorter JWT lifetimes
- A token blacklist for logout
- Refresh token rotation

---

## MEDIUM — In-Memory Rate Limiter Won't Scale

`lib/rate-limit.ts` uses a JavaScript `Map` for rate limiting. This:

- Resets on every serverless cold start
- Doesn't work across multiple instances/regions
- Provides no protection in a distributed deployment

**Recommendation:** Use Redis-based rate limiting (e.g., `@upstash/ratelimit`) for production.

---

## MEDIUM — Prompt Injection Guardrails Are Regex-Based

`lib/chat-guardrails.ts` uses regex patterns to detect prompt injection. This can be bypassed with:

- Unicode encoding tricks
- Obfuscation/misspellings
- Indirect injection via stored context

**Recommendation:** Use a more robust approach for an AI assistant with access to financial tools.

---

## LOW — Middleware Route Matching Gap

The middleware at `middleware.ts:25` excludes all `/api` routes from auth checks. While each API route handler checks auth individually, a single missed check in a new route could expose data.

**Recommendation:** Add auth checks at the middleware level for `/api` routes as well.

---

## What's Done Well

- **SQL Injection**: Fully protected via Drizzle ORM parameterized queries
- **XSS**: No unsafe `eval()`, `innerHTML`, or user-controlled `dangerouslySetInnerHTML`
- **Authentication**: All API routes and server actions check `session.user.id`
- **Row-Level Security**: Every query filters by `userId` — no cross-user data access
- **Password Hashing**: bcryptjs with 12 salt rounds
- **Input Validation**: Comprehensive Zod schemas on all endpoints
- **No Hardcoded Secrets**: All secrets via `process.env`, `.env` is in `.gitignore` and was never committed
- **Open Redirects**: None — all redirects use hardcoded paths
- **SSRF**: None — no user-provided URLs in server-side fetches
- **File Uploads**: Audio limited to 5MB with type validation
- **Error Messages**: Generic errors returned to clients, no sensitive data leaks
- **No Eval**: Zero instances of `eval()`, `new Function()`, or dynamic code execution

---

## Recommended Priority Actions

### Immediate

1. `npm audit fix` — fix the flatted prototype pollution
2. `npm install next@latest` — fix all 4 Next.js vulnerabilities including CSRF bypass
3. Add security headers to `next.config.ts`

### Short-term

4. Add rate limiting to login and registration endpoints
5. Strengthen password policy (min 8-12 chars, complexity)
6. Add CAPTCHA to registration/login

### Medium-term

7. Move rate limiting to Redis for serverless compatibility
8. Implement JWT token blacklist for logout
9. Strengthen prompt injection detection
10. Add audit logging for auth events (failed logins, password changes)
11. Consider adding 2FA/MFA for a financial app
