import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loginLimiter } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 1 day (default is 30 days — too long for a financial app)
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

        // Rate limit login attempts by email
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
          return null;
        }

        const isValid = await compare(password, user.hashedPassword);
        if (!isValid) {
          return null;
        }

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
      if (user) {
        token.id = user.id;
      }
      // Always fetch the latest plan/currency from DB so admin changes take effect immediately
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
});
