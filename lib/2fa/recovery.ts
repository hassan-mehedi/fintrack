/**
 * Recovery codes. Each user gets 10 on enrollment; each is good for ONE
 * login if they lose their authenticator. We store only bcrypt hashes —
 * the plaintext leaves the server exactly once, in the enrollment response.
 *
 * Format: 4 groups of 4 [A-Z0-9 minus ambiguous] separated by dashes,
 * e.g. "K3PR-9XAM-7H2L-Q4WT". Easy to type from a printed sheet, hard to
 * confuse 0/O or I/1.
 */

import { hash, compare } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { recoveryCodes } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I
const RECOVERY_GROUP_SIZE = 4;
const RECOVERY_GROUPS = 4;
export const RECOVERY_CODE_COUNT = 10;

function randomCodeChar(): string {
  // randomBytes(1) returns 0..255; map to alphabet of length 32 with rejection
  // sampling so distribution is uniform.
  while (true) {
    const b = randomBytes(1)[0];
    if (b < 256 - (256 % RECOVERY_ALPHABET.length)) {
      return RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
    }
  }
}

export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_GROUPS; g++) {
    let group = "";
    for (let i = 0; i < RECOVERY_GROUP_SIZE; i++) group += randomCodeChar();
    groups.push(group);
  }
  return groups.join("-");
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode());
}

export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

/** Hashes a recovery code after canonicalising whitespace + case. */
export async function hashRecoveryCode(code: string): Promise<string> {
  return hash(normalizeRecoveryCode(code), 10);
}

/**
 * Looks up the user's unused recovery codes, compares each via bcrypt, and
 * marks the matching one as used on hit. Returns true if a code was consumed.
 */
export async function verifyAndConsumeRecoveryCode(
  userId: string,
  submitted: string,
): Promise<boolean> {
  const normalised = normalizeRecoveryCode(submitted);
  if (normalised.length !== RECOVERY_GROUP_SIZE * RECOVERY_GROUPS) return false;

  const rows = await db
    .select({ id: recoveryCodes.id, codeHash: recoveryCodes.codeHash })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));

  for (const r of rows) {
    if (await compare(normalised, r.codeHash)) {
      await db
        .update(recoveryCodes)
        .set({ usedAt: new Date() })
        .where(eq(recoveryCodes.id, r.id));
      return true;
    }
  }
  return false;
}
