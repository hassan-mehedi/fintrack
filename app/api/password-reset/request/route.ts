import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import {
  passwordResetTokens,
  users,
} from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
} from "@/lib/password-reset";
import {
  isBodyTooLarge,
  passwordResetRequestLimiter,
} from "@/lib/rate-limit";
import { forgotPasswordRequestSchema } from "@/lib/validators";

const GENERIC_RESPONSE = {
  message: "If an account with that email exists, we sent a password reset link.",
};

export async function POST(req: Request) {
  const start = Date.now();
  logger.info(
    { method: "POST", path: "/api/password-reset/request" },
    "request received"
  );

  if (isBodyTooLarge(req)) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const userAgent = req.headers.get("user-agent") ?? null;
    const { success, retryAfterMs } = await passwordResetRequestLimiter(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json();
    const parsed = forgotPasswordRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    if (
      process.env.NODE_ENV === "production" &&
      !isPasswordResetEmailConfigured()
    ) {
      logger.error("password reset requested without Resend configuration");
      return NextResponse.json(
        { error: "Password reset is temporarily unavailable." },
        { status: 503 }
      );
    }

    const email = parsed.data.email;
    const emailLimit = await passwordResetRequestLimiter(email.toLowerCase());

    if (!emailLimit.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(emailLimit.retryAfterMs / 1000)) },
        }
      );
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    await createAuditLog({
      action: "password_reset_requested",
      userId: user?.id ?? null,
      ipAddress: ip,
      userAgent,
      metadata: { email },
    });

    if (!user) {
      logger.info(
        { method: "POST", path: "/api/password-reset/request", status: 200, duration: Date.now() - start },
        "request completed"
      );
      return NextResponse.json(GENERIC_RESPONSE);
    }

    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    const { token, tokenHash, expiresAt } = createPasswordResetToken();
    const resetUrl = buildPasswordResetUrl(token);

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    if (isPasswordResetEmailConfigured()) {
      try {
        await sendPasswordResetEmail({
          email: user.email,
          name: user.name,
          resetUrl,
        });
      } catch (error) {
        logger.error(
          { err: error, email: user.email },
          "password reset email delivery failed"
        );
      }
    } else {
      logger.info(
        { email: user.email, resetUrl },
        "password reset email skipped because Resend is not configured in development"
      );
    }

    logger.info(
      { method: "POST", path: "/api/password-reset/request", status: 200, duration: Date.now() - start },
      "request completed"
    );
    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    logger.error(
      { method: "POST", path: "/api/password-reset/request", err: error },
      "password reset request failed"
    );
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
