import { db } from "@/lib/db";
import { merchants } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Canonicalises a merchant name for dedupe + matching:
 * - lowercase
 * - strip punctuation (keep letters, digits, spaces)
 * - collapse whitespace
 * - trim
 *
 * Examples:
 *   "Starbucks Coffee Co."    -> "starbucks coffee co"
 *   "Daraz.com.bd"            -> "darazcombd"  (no, see below)
 *   "Pathao Food - Banani"    -> "pathao food banani"
 *
 * Punctuation including dots and hyphens is stripped without inserting
 * spaces, so "Daraz.com.bd" becomes "darazcombd". That's fine — the goal
 * is dedupe, not legibility.
 */
export function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find a merchant for this user matching `name` (after normalisation), or
 * insert a new row. Idempotent under concurrent calls thanks to the unique
 * index on (userId, normalized).
 */
export async function findOrCreateMerchant(
  userId: string,
  name: string,
): Promise<{ id: string; name: string; normalized: string; defaultCategoryId: string | null }> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("merchant name is empty");
  const normalized = normalizeMerchantName(cleanName);
  if (!normalized) throw new Error("merchant name normalises to empty");

  const [existing] = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      normalized: merchants.normalized,
      defaultCategoryId: merchants.defaultCategoryId,
    })
    .from(merchants)
    .where(and(eq(merchants.userId, userId), eq(merchants.normalized, normalized)))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(merchants)
    .values({ userId, name: cleanName, normalized })
    .onConflictDoNothing({
      target: [merchants.userId, merchants.normalized],
    })
    .returning({
      id: merchants.id,
      name: merchants.name,
      normalized: merchants.normalized,
      defaultCategoryId: merchants.defaultCategoryId,
    });
  if (created) return created;

  // onConflictDoNothing returned 0 rows → another caller raced ahead, re-select.
  const [winner] = await db
    .select({
      id: merchants.id,
      name: merchants.name,
      normalized: merchants.normalized,
      defaultCategoryId: merchants.defaultCategoryId,
    })
    .from(merchants)
    .where(and(eq(merchants.userId, userId), eq(merchants.normalized, normalized)))
    .limit(1);
  if (!winner) throw new Error("merchant insert lost race AND select returned empty");
  return winner;
}
