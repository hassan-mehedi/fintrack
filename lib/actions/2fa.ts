"use server";

import { db } from "@/lib/db";
import { twoFactorSecrets, recoveryCodes, users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, eq, isNull, sql } from "drizzle-orm";
import { compare } from "bcryptjs";
import {
  buildEnrollment,
  generateSecret,
  verifyTotp,
  type EnrollmentPayload,
} from "@/lib/2fa/totp";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/2fa/recovery";
import { encryptField, decryptField } from "@/lib/2fa/encryption";
import { recordChange } from "@/lib/audit-entity";
import { revalidatePath } from "next/cache";

export type TwoFactorStatus = {
  enabled: boolean;
  enrollmentStarted: boolean;
  lastUsedAt: Date | null;
  unusedRecoveryCodes: number;
};

export async function get2faStatus(): Promise<TwoFactorStatus> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [row] = await db
    .select({
      enabledAt: twoFactorSecrets.enabledAt,
      lastUsedAt: twoFactorSecrets.lastUsedAt,
    })
    .from(twoFactorSecrets)
    .where(eq(twoFactorSecrets.userId, session.user.id))
    .limit(1);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(recoveryCodes)
    .where(
      and(eq(recoveryCodes.userId, session.user.id), isNull(recoveryCodes.usedAt)),
    );

  return {
    enabled: !!row?.enabledAt,
    enrollmentStarted: !!row && !row.enabledAt,
    lastUsedAt: row?.lastUsedAt ?? null,
    unusedRecoveryCodes: Number(countRow?.count ?? 0),
  };
}

/**
 * Generates a fresh TOTP secret (encrypted, stored as a pending enrollment
 * with `enabledAt = null`) and returns the QR code + raw secret so the
 * user can register the device. Calling this again before confirming
 * replaces the pending secret.
 */
export async function startEnrollment(): Promise<EnrollmentPayload> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new Error("Unauthorized");

  const status = await get2faStatus();
  if (status.enabled) throw new Error("2FA is already enabled. Disable it first to re-enrol.");

  const secret = generateSecret();
  const encryptedSecret = encryptField(secret);

  await db
    .insert(twoFactorSecrets)
    .values({ userId: session.user.id, encryptedSecret })
    .onConflictDoUpdate({
      target: twoFactorSecrets.userId,
      set: { encryptedSecret, enabledAt: null },
    });

  return buildEnrollment(secret, session.user.email);
}

/**
 * Verifies the user's first TOTP code against the pending secret. On success:
 *   1. marks the secret as enabled
 *   2. generates 10 recovery codes, hashes them, returns the plaintext ONCE
 *   3. audits the change
 */
export async function confirmEnrollment(code: string): Promise<{ recoveryCodes: string[] }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [row] = await db
    .select({
      encryptedSecret: twoFactorSecrets.encryptedSecret,
      enabledAt: twoFactorSecrets.enabledAt,
    })
    .from(twoFactorSecrets)
    .where(eq(twoFactorSecrets.userId, session.user.id))
    .limit(1);
  if (!row) throw new Error("No enrolment in progress — call startEnrollment first.");
  if (row.enabledAt) throw new Error("2FA is already enabled.");

  const secret = decryptField(row.encryptedSecret);
  if (!verifyTotp(secret, code)) {
    throw new Error("Code didn't match. Check your authenticator's clock and try again.");
  }

  // Generate + persist recovery codes (clears any prior unused ones first).
  await db
    .delete(recoveryCodes)
    .where(eq(recoveryCodes.userId, session.user.id));
  const codes = generateRecoveryCodes();
  await db.insert(recoveryCodes).values(
    await Promise.all(
      codes.map(async (c) => ({
        userId: session.user!.id,
        codeHash: await hashRecoveryCode(c),
      })),
    ),
  );

  await db
    .update(twoFactorSecrets)
    .set({ enabledAt: new Date() })
    .where(eq(twoFactorSecrets.userId, session.user.id));

  await recordChange({
    ctx: { userId: session.user.id, source: "2fa" },
    entity: "account",
    entityId: session.user.id,
    action: "update",
    before: { twoFactorEnabled: false },
    after: { twoFactorEnabled: true },
  });

  revalidatePath("/settings");
  return { recoveryCodes: codes };
}

/**
 * Disables 2FA. Requires the user's current password as a soft confirmation
 * — even if the session is already authenticated, this is a high-impact
 * change that should require step-up.
 */
export async function disable2fa(args: { password: string }): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [user] = await db
    .select({ hashedPassword: users.hashedPassword })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) throw new Error("Unauthorized");
  if (!(await compare(args.password, user.hashedPassword))) {
    throw new Error("Password is incorrect.");
  }

  await db
    .delete(twoFactorSecrets)
    .where(eq(twoFactorSecrets.userId, session.user.id));
  await db
    .delete(recoveryCodes)
    .where(eq(recoveryCodes.userId, session.user.id));

  await recordChange({
    ctx: { userId: session.user.id, source: "2fa" },
    entity: "account",
    entityId: session.user.id,
    action: "update",
    before: { twoFactorEnabled: true },
    after: { twoFactorEnabled: false },
  });

  revalidatePath("/settings");
}

/**
 * Re-issues 10 recovery codes, invalidating all prior unused ones.
 * Requires 2FA to be enabled.
 */
export async function regenerateRecoveryCodes(): Promise<{ recoveryCodes: string[] }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [row] = await db
    .select({ enabledAt: twoFactorSecrets.enabledAt })
    .from(twoFactorSecrets)
    .where(eq(twoFactorSecrets.userId, session.user.id))
    .limit(1);
  if (!row?.enabledAt) throw new Error("Enable 2FA before generating recovery codes.");

  await db
    .delete(recoveryCodes)
    .where(eq(recoveryCodes.userId, session.user.id));
  const codes = generateRecoveryCodes();
  await db.insert(recoveryCodes).values(
    await Promise.all(
      codes.map(async (c) => ({
        userId: session.user!.id,
        codeHash: await hashRecoveryCode(c),
      })),
    ),
  );

  await recordChange({
    ctx: { userId: session.user.id, source: "2fa" },
    entity: "account",
    entityId: session.user.id,
    action: "update",
    before: { recoveryCodesRegenerated: false },
    after: { recoveryCodesRegenerated: true },
  });

  revalidatePath("/settings");
  return { recoveryCodes: codes };
}
