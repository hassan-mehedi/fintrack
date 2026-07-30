import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { env } from "../env.js";

const secret = new TextEncoder().encode(env.authSecret);

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AccessTokenPayload {
    sub: string;
    jti: string;
    plan: "free" | "pro";
    currency: string;
    sessionVersion: number;
    type: "access";
}

export interface RefreshTokenPayload {
    sub: string;
    jti: string;
    sessionVersion: number;
    type: "refresh";
}

interface UserClaims {
    id: string;
    plan: "free" | "pro";
    currency: string;
    sessionVersion: number;
}

export async function signAccessToken(user: UserClaims): Promise<string> {
    return new SignJWT({
        plan: user.plan,
        currency: user.currency,
        sessionVersion: user.sessionVersion,
        type: "access",
    })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(user.id)
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
        .sign(secret);
}

export async function signRefreshToken(
    user: Pick<UserClaims, "id" | "sessionVersion">
): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const token = await new SignJWT({
        sessionVersion: user.sessionVersion,
        type: "refresh",
    })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(user.id)
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime(`${REFRESH_TOKEN_TTL_SECONDS}s`)
        .sign(secret);
    return { token, jti };
}

export async function verifyToken<T extends AccessTokenPayload | RefreshTokenPayload>(
    token: string,
    expectedType: T["type"]
): Promise<(T & { exp: number }) | null> {
    try {
        const { payload } = await jwtVerify(token, secret);
        if (payload.type !== expectedType || !payload.sub || !payload.jti) {
            return null;
        }
        return payload as unknown as T & { exp: number };
    } catch {
        return null;
    }
}
