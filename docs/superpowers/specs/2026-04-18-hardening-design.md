# FinTrack Hardening — Design Spec

**Date:** 2026-04-18
**Phases:** Security → Observability → Testing

---

## Phase 1: Security

### 1.1 Content Security Policy Header

Add CSP to `next.config.ts` alongside existing security headers.

Policy directives:
- `default-src 'self'`
- `script-src 'self'`
- `style-src 'self' 'unsafe-inline'` (required for Tailwind CSS)
- `img-src 'self' data: blob:`
- `connect-src 'self' https://api.openai.com https://*.upstash.io`
- `font-src 'self'`
- `frame-ancestors 'none'`
- `base-uri 'self'`
- `form-action 'self'`

### 1.2 JWT Token Revocation

**Goal:** Invalidate sessions immediately on logout.

**Mechanism:** Redis-based token blocklist using Upstash (already in stack).

**Implementation:**
- Inject `jti` (UUID) into every JWT in the NextAuth `jwt` callback on first creation
- On logout: call a `revokeToken(jti, expiresAt)` helper that stores the `jti` in Redis with TTL = remaining token lifetime (so entries auto-expire and don't accumulate)
- In the NextAuth `jwt` callback on every request: check Redis for the `jti`; if found, return `null` to invalidate the session
- Logout is triggered via NextAuth `signOut()` — hook into the session to extract `jti` before the cookie is cleared

**Files affected:**
- `lib/auth.ts` — JWT callback (inject jti, check blocklist)
- `lib/token-revocation.ts` — new helper (`revokeToken`, `isTokenRevoked`)
- Sign-out action — call `revokeToken` before `signOut()`

### 1.3 Audit Logging

**Goal:** Persist a record of key auth and security events.

**Schema — new `auditLogs` table:**

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | auto-generated |
| userId | uuid FK nullable | null for failed login attempts |
| action | enum | see actions below |
| ipAddress | varchar(45) | IPv4 or IPv6 |
| userAgent | text nullable | browser/client string |
| metadata | jsonb nullable | extra context (e.g., email attempted) |
| createdAt | timestamp | auto |

**Action enum values:** `login_success`, `login_failed`, `logout`, `register`

**Helper:** `lib/audit.ts` exports `createAuditLog({ action, userId?, request, metadata? })` — extracts IP and user-agent from the request, writes to DB.

**Hook points:**
- NextAuth `signIn` callback → `login_success` / `login_failed`
- NextAuth `events.signOut` → `logout`
- `POST /api/register` → `register`

---

## Phase 2: Observability

### 2.1 Structured Logging with Pino

**Dependencies:** `pino`, `pino-pretty` (devDependency)

**Logger singleton — `lib/logger.ts`:**
- JSON output in production
- Pretty-printed in development (`pino-pretty`)
- Log level: `debug` in dev, `info` in production (driven by `NODE_ENV`)
- Default fields: `service: 'fintrack'`, `env`

**Usage:**
- API route handlers: log request start (method, path, userId), request end (status, duration ms), and errors
- Server actions: log errors with stack traces on catch
- Auth events (via audit log helper): log at `info` level

**No middleware-level logging** — Next.js middleware runs on the edge runtime which doesn't support Pino. Log per-handler instead.

---

## Phase 3: Testing

### 3.1 Unit Tests with Vitest

**Dependencies:** `vitest`

**Config:** `vitest.config.ts` at project root — resolve aliases matching `tsconfig.json` paths.

**Test files and coverage targets:**

| File | What to test |
|---|---|
| `lib/validators.test.ts` | All Zod schemas: valid inputs pass, invalid inputs fail with correct errors |
| `lib/chat-guardrails.test.ts` | Known injection strings blocked, clean messages pass, edge cases (Unicode, zero-width chars) |
| `lib/accounts.test.ts` | `getBalanceDelta()` for all account type × transaction type combinations; asset/liability classification |
| `lib/utils.test.ts` | Utility functions: `cn()`, currency formatting, date helpers |

**Test script:** `"test": "vitest run"`, `"test:watch": "vitest"`

---

## Out of Scope (this phase)

- 2FA/MFA
- CAPTCHA
- E2E or integration tests
- Error tracking (Sentry etc.)
- New user-facing features
