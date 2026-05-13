import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { hashPasswordResetToken } from "@/lib/password-reset";
import {
  isBodyTooLarge,
  passwordResetConfirmLimiter,
} from "@/lib/rate-limit";
import {
  passwordResetTokens,
  users,
} from "@/lib/db/schema";
import { resetPasswordSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const start = Date.now();
  logger.info(
    { method: "POST", path: "/api/password-reset/confirm" },
    "request received"
  );

  if (isBodyTooLarge(req)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const userAgent = req.headers.get("user-agent") ?? null;
    const { success, retryAfterMs } = await passwordResetConfirmLimiter(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const tokenHash = hashPasswordResetToken(parsed.data.token);
    const now = new Date();

    const [tokenRecord] = await db
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
      })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          gt(passwordResetTokens.expiresAt, now)
        )
      )
      .limit(1);

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "This password reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, tokenRecord.userId));

    const hashedPassword = await hash(parsed.data.password, 12);

    await db
      .update(users)
      .set({
        hashedPassword,
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, tokenRecord.userId));

    await createAuditLog({
      action: "password_reset_completed",
      userId: tokenRecord.userId,
      ipAddress: ip,
      userAgent,
    });

    logger.info(
      { method: "POST", path: "/api/password-reset/confirm", status: 200, duration: Date.now() - start },
      "request completed"
    );
    return NextResponse.json({ message: "Password updated successfully." });
  } catch (error) {
    logger.error(
      { method: "POST", path: "/api/password-reset/confirm", err: error },
      "password reset confirm failed"
    );
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
