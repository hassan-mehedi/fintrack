import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loginLimiter } from "@/lib/rate-limit";
import { revokeToken, isTokenRevoked } from "@/lib/token-revocation";
import { createAuditLog } from "@/lib/audit";

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Inject jti once on initial sign-in
      if (user) {
        token.id = user.id;
        token.jti = randomUUID();
      }

      // Reject revoked tokens
      if (token.jti) {
        const revoked = await isTokenRevoked(token.jti as string);
        if (revoked) return null;
      }

      // Always fetch the latest plan/currency from DB
      if (token.id) {
        const [dbUser] = await db
          .select({ plan: users.plan, currency: users.currency })
          .from(users)
          .where(eq(users.id, token.id as string))
          .limit(1);
        token.plan = dbUser?.plan ?? "free";
        token.currency = dbUser?.currency ?? "BDT";
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
