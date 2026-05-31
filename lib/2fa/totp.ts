/**
 * TOTP wrapper. Single source of truth for clock skew, digit count, period.
 *
 * Uses `otplib` — a free MIT-licensed library. RFC 6238-compliant.
 */

import { authenticator } from "otplib";
import QRCode from "qrcode";

// RFC 6238 defaults — 6 digits, 30s period.
// Accept the current step + 1 in either direction (±30s of clock skew).
authenticator.options = {
  digits: 6,
  step: 30,
  window: 1,
};

export type EnrollmentPayload = {
  secret: string; // base32, shown ONCE to the user (or embedded in QR)
  otpauthUrl: string;
  qrDataUrl: string; // data:image/png;base64,...
};

const ISSUER = "FinTrack";

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(secret: string, accountLabel: string): string {
  // accountLabel is what shows up in Google Authenticator etc. Use the user's
  // email; the issuer prefix is added by the lib.
  return authenticator.keyuri(accountLabel, ISSUER, secret);
}

export async function buildEnrollment(
  secret: string,
  accountLabel: string,
): Promise<EnrollmentPayload> {
  const otpauthUrl = buildOtpAuthUrl(secret, accountLabel);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
  return { secret, otpauthUrl, qrDataUrl };
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!token || !/^\d{6}$/.test(token)) return false;
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export function currentTotpFor(secret: string): string {
  return authenticator.generate(secret);
}
