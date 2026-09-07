"use server";

import { revalidatePath } from "next/cache";
import { importTransactions as importCore } from "@fintrack/core/import";
import { requireUserId } from "@/lib/action-session";

const AFFECTED_PATHS = [
    "/dashboard",
    "/transactions",
    "/accounts",
    "/analytics",
    "/budgets",
    "/categories",
];

export async function importTransactions(data: unknown) {
    const userId = await requireUserId();
    const result = await importCore(userId, data);

    AFFECTED_PATHS.forEach((path) => revalidatePath(path));
    return result;
}
