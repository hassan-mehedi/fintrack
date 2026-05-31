import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { users, twoFactorSecrets, userSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loginLimiter } from "@/lib/rate-limit";
import { revokeToken, isTokenRevoked } from "@/lib/token-revocation";
import { createAuditLog } from "@/lib/audit";
import { verifyTotp } from "@/lib/2fa/totp";
import { decryptField } from "@/lib/2fa/encryption";
import { verifyAndConsumeRecoveryCode } from "@/lib/2fa/recovery";

/** Thrown by the credentials provider when 2FA is enabled but no code was supplied. */
export const TOTP_REQUIRED = "TOTP_REQUIRED";

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
        totpCode: { label: "Authenticator code", type: "text" },
        recoveryCode: { label: "Recovery code", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;
        const totpCode = (credentials.totpCode as string | undefined)?.trim() || null;
        const recoveryCode = (credentials.recoveryCode as string | undefined)?.trim() || null;
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

        // Password is good — check whether 2FA is enabled for this user.
        const [tfa] = await db
          .select({
            encryptedSecret: twoFactorSecrets.encryptedSecret,
            enabledAt: twoFactorSecrets.enabledAt,
          })
          .from(twoFactorSecrets)
          .where(eq(twoFactorSecrets.userId, user.id))
          .limit(1);

        if (tfa?.enabledAt) {
          // 2FA enabled. Require a valid TOTP or recovery code.
          if (!totpCode && !recoveryCode) {
            // Signal to the login UI to switch to the code step.
            throw new Error(TOTP_REQUIRED);
          }
          let secondFactorOk = false;
          if (totpCode) {
            const secret = decryptField(tfa.encryptedSecret);
            secondFactorOk = verifyTotp(secret, totpCode);
            if (secondFactorOk) {
              await db
                .update(twoFactorSecrets)
                .set({ lastUsedAt: new Date() })
                .where(eq(twoFactorSecrets.userId, user.id));
            }
          }
          if (!secondFactorOk && recoveryCode) {
            secondFactorOk = await verifyAndConsumeRecoveryCode(user.id, recoveryCode);
          }
          if (!secondFactorOk) {
            await createAuditLog({
              action: "login_failed",
              userId: user.id,
              ipAddress: ip,
              userAgent,
              metadata: { email, reason: "2fa_failed" },
            });
            throw new Error("Invalid authenticator code");
          }
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
          sessionVersion: user.sessionVersion,
          // Pass headers through to jwt() via the user object so we can
          // record the user-agent / ip on the user_sessions row.
          _ua: userAgent,
          _ip: ip,
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
        token.sessionVersion = (user as { sessionVersion?: number }).sessionVersion ?? 0;

        // Record this session for the management UI. Best-effort — a failure
        // here should NOT block sign-in.
        const ua = (user as { _ua?: string | null })._ua ?? null;
        const ip = (user as { _ip?: string | null })._ip ?? null;
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        db.insert(userSessions)
          .values({
            jti: token.jti as string,
            userId: token.id as string,
            userAgent: ua,
            ipAddress: ip,
            expiresAt,
          })
          .onConflictDoNothing()
          .catch(() => {});
      } else if (token.jti && token.id) {
        // touch lastSeenAt on subsequent jwt() runs — fire and forget
        db.update(userSessions)
          .set({ lastSeenAt: new Date() })
          .where(eq(userSessions.jti, token.jti as string))
          .catch(() => {});
      }

      // Reject revoked tokens
      if (token.jti) {
        const revoked = await isTokenRevoked(token.jti as string);
        if (revoked) return null;
      }

      // Always fetch the latest plan/currency from DB
      if (token.id) {
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
      // Surface the jwt id so server actions can identify the current session
      // when listing all of a user's active devices.
      (session as unknown as { jti?: string }).jti = token.jti as string | undefined;
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
