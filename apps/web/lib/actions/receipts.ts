"use server";

import { revalidatePath } from "next/cache";
import * as receipts from "@fintrack/core/receipts";
import { requireUserId } from "@/lib/action-session";

export async function removeReceipt(transactionId: string) {
    const userId = await requireUserId();
    await receipts.removeReceipt(userId, transactionId);

    revalidatePath("/transactions");
}
