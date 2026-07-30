import { createHash, randomBytes } from "crypto";
import { logger } from "@/lib/logger";

const DEFAULT_SITE_URL = "http://localhost:3000";

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPasswordResetToken() {
  const token = randomBytes(32).toString("hex");

  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  };
}

export function buildPasswordResetUrl(token: string) {
  const url = new URL("/reset-password", getSiteUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

export function isPasswordResetEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendPasswordResetEmail({
  email,
  name,
  resetUrl,
}: {
  email: string;
  name: string;
  resetUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("Resend is not configured.");
  }

  const safeName = escapeHtml(name);
  const safeResetUrl = escapeHtml(resetUrl);
  const replyTo = process.env.RESEND_REPLY_TO;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Reset your FinTrack password",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
          <h1 style="font-size: 22px; margin-bottom: 12px;">Reset your password</h1>
          <p>Hello ${safeName},</p>
          <p>We received a request to reset your FinTrack password.</p>
          <p>
            <a
              href="${safeResetUrl}"
              style="display: inline-block; padding: 12px 18px; background: #17935f; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;"
            >
              Reset password
            </a>
          </p>
          <p>This link expires in 1 hour.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: `Hello ${name},

We received a request to reset your FinTrack password.

Reset password: ${resetUrl}

This link expires in 1 hour.

If you did not request this, you can ignore this email.`,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, body: errorText },
      "resend email request failed"
    );
    throw new Error("Failed to send password reset email.");
  }
}
