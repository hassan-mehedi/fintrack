"use server";

import { auth } from "@/lib/auth";
import { restoreTransaction } from "@/lib/ledger";
import { recordChange } from "@/lib/audit-entity";
import { revalidatePath } from "next/cache";

/**
 * Reverses a recent transaction delete. Idempotent: calling on a live
 * transaction does nothing.
 */
export async function undoDeleteTransaction(transactionId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await restoreTransaction({ transactionId, userId: session.user.id });

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "transaction",
    entityId: transactionId,
    action: "restore",
    after: { restoredAt: new Date() },
  });

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
}

export async function undoBulkDeleteTransactions(ids: string[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  let restored = 0;
  for (const id of ids) {
    try {
      await restoreTransaction({ transactionId: id, userId: session.user.id });
      restored++;
    } catch {
      // skip
    }
  }

  await recordChange({
    ctx: { userId: session.user.id },
    entity: "transaction",
    entityId: ids[0],
    action: "restore",
    before: { bulkDeleted: ids.length },
    after: { restored },
  });

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  return { restored };
}
