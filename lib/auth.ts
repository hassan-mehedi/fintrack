import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { randomUUID } from "crypto";
import { cache } from "react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loginLimiter } from "@/lib/rate-limit";
import { revokeToken, isTokenRevoked } from "@/lib/token-revocation";
import { createAuditLog } from "@/lib/audit";

// How long a token trusts its cached plan/currency before re-reading the DB.
// Revocation (per-token) is still checked on every request; only the bulk
// sessionVersion check and plan/currency refresh are throttled to this window.
const TOKEN_REFRESH_MS = 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const userAgent = request.headers.get("user-agent") ?? null;

        const { success } = await loginLimiter(email.toLowerCase());
        if (!success) {
          throw new Error("Too many login attempts. Please try again later.");
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || !user.hashedPassword) {
          await createAuditLog({
            action: "login_failed",
            ipAddress: ip,
            userAgent,
            metadata: { email },
          });
          return null;
        }

        const isValid = await compare(password, user.hashedPassword);
        if (!isValid) {
          await createAuditLog({
            action: "login_failed",
            userId: user.id,
            ipAddress: ip,
            userAgent,
            metadata: { email },
          });
          return null;
        }

        await createAuditLog({
          action: "login_success",
          userId: user.id,
          ipAddress: ip,
          userAgent,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          plan: user.plan,
          currency: user.currency,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Seed the token from the DB row on initial sign-in — no extra query needed
      if (user) {
        const u = user as {
          id: string;
          plan?: "free" | "pro";
          currency?: string;
          sessionVersion?: number;
        };
        token.id = u.id;
        token.jti = randomUUID();
        token.sessionVersion = u.sessionVersion ?? 0;
        token.plan = u.plan ?? "free";
        token.currency = u.currency ?? "BDT";
        token.refreshAt = Date.now() + TOKEN_REFRESH_MS;
      }

      // Reject revoked tokens — checked on every request
      if (token.jti) {
        const revoked = await isTokenRevoked(token.jti as string);
        if (revoked) return null;
      }

      // Refresh plan/currency and re-check sessionVersion only past the window
      // (or when the client explicitly asks via update())
      const refreshAt = token.refreshAt as number | undefined;
      const needsRefresh =
        trigger === "update" || !refreshAt || Date.now() > refreshAt;

      if (token.id && needsRefresh) {
        const [dbUser] = await db
          .select({
            plan: users.plan,
            currency: users.currency,
            sessionVersion: users.sessionVersion,
          })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);
        if (!dbUser) {
          return null;
        }
        if ((token.sessionVersion as number | undefined) !== dbUser.sessionVersion) {
          return null;
        }
        token.plan = dbUser.plan ?? "free";
        token.currency = dbUser.currency ?? "BDT";
        token.refreshAt = Date.now() + TOKEN_REFRESH_MS;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.plan = (token.plan as "free" | "pro") ?? "free";
        session.user.currency = (token.currency as string) ?? "BDT";
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = (message as { token?: { jti?: string; exp?: number; id?: string } }).token;
      if (token?.jti && token?.exp) {
        await revokeToken(token.jti, token.exp);
      }
      if (token?.id) {
        await createAuditLog({ action: "logout", userId: token.id as string });
      }
    },
  },
});

// Request-scoped session read: multiple calls within one server render/action
// (layout + page + data fetchers) share a single auth() resolution.
export const getSession = cache(() => auth());
