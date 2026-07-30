import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { isTokenRevoked } from "./revocation-store.js";
import { verifyToken, type AccessTokenPayload } from "./tokens.js";

export interface AuthenticatedUser {
    id: string;
    plan: "free" | "pro";
    currency: string;
    sessionVersion: number;
    jti: string;
}

declare module "fastify" {
    interface FastifyRequest {
        user: AuthenticatedUser | null;
    }
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

export const authPlugin = fp(async (app) => {
    app.decorateRequest("user", null);

    app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
        const header = request.headers.authorization;
        if (!header?.startsWith("Bearer ")) {
            return reply.code(401).send({ error: "Missing bearer token" });
        }

        const payload = await verifyToken<AccessTokenPayload>(header.slice(7), "access");
        if (!payload) {
            return reply.code(401).send({ error: "Invalid or expired token" });
        }

        if (await isTokenRevoked(payload.jti)) {
            return reply.code(401).send({ error: "Token revoked" });
        }

        request.user = {
            id: payload.sub,
            plan: payload.plan,
            currency: payload.currency,
            sessionVersion: payload.sessionVersion,
            jti: payload.jti,
        };
    });
});
