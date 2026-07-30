import type { FastifyInstance } from "fastify";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@fintrack/db";
import { users } from "@fintrack/db/schema";
import { loginSchema } from "@fintrack/shared/validators";
import { isTokenRevoked, revokeToken } from "../auth/revocation-store.js";
import {
    ACCESS_TOKEN_TTL_SECONDS,
    signAccessToken,
    signRefreshToken,
    verifyToken,
    type RefreshTokenPayload,
} from "../auth/tokens.js";

const refreshSchema = z.object({
    refreshToken: z.string().min(1),
});

async function issueTokenPair(user: {
    id: string;
    plan: "free" | "pro";
    currency: string;
    sessionVersion: number;
}) {
    const accessToken = await signAccessToken(user);
    const { token: refreshToken } = await signRefreshToken(user);
    return {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        tokenType: "Bearer" as const,
    };
}

export async function authRoutes(app: FastifyInstance) {
    app.post(
        "/login",
        { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
        async (request, reply) => {
            const parsed = loginSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(400).send({ error: "Invalid email or password format" });
            }

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, parsed.data.email))
                .limit(1);

            if (!user?.hashedPassword || !(await compare(parsed.data.password, user.hashedPassword))) {
                return reply.code(401).send({ error: "Invalid credentials" });
            }

            const tokens = await issueTokenPair(user);
            return reply.send({
                ...tokens,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    plan: user.plan,
                    currency: user.currency,
                },
            });
        }
    );

    app.post(
        "/refresh",
        { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
        async (request, reply) => {
            const parsed = refreshSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(400).send({ error: "refreshToken is required" });
            }

            const payload = await verifyToken<RefreshTokenPayload>(
                parsed.data.refreshToken,
                "refresh"
            );
            if (!payload || (await isTokenRevoked(payload.jti))) {
                return reply.code(401).send({ error: "Invalid or revoked refresh token" });
            }

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, payload.sub))
                .limit(1);

            if (!user || user.sessionVersion !== payload.sessionVersion) {
                return reply.code(401).send({ error: "Session no longer valid" });
            }

            // Rotate: the old refresh token is single-use
            await revokeToken(payload.jti, payload.exp);
            const tokens = await issueTokenPair(user);
            return reply.send(tokens);
        }
    );

    app.post("/logout", async (request, reply) => {
        const parsed = refreshSchema.safeParse(request.body);
        if (parsed.success) {
            const payload = await verifyToken<RefreshTokenPayload>(
                parsed.data.refreshToken,
                "refresh"
            );
            if (payload) {
                await revokeToken(payload.jti, payload.exp);
            }
        }
        return reply.send({ success: true });
    });
}
