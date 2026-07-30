"use server";

import { revalidatePath } from "next/cache";
import * as accounts from "@fintrack/core/accounts";
import { requireUserId } from "@/lib/action-session";

export async function getAccounts() {
    const userId = await requireUserId();
    return accounts.getAccounts(userId);
}

export async function createAccount(data: unknown) {
    const userId = await requireUserId();
    const account = await accounts.createAccount(userId, data);

    revalidatePath("/");
    revalidatePath("/accounts");
    return account;
}

export async function updateAccount(id: string, data: unknown) {
    const userId = await requireUserId();
    const account = await accounts.updateAccount(userId, id, data);

    revalidatePath("/");
    revalidatePath("/accounts");
    return account;
}

export async function deleteAccount(id: string) {
    const userId = await requireUserId();
    await accounts.deleteAccount(userId, id);

    revalidatePath("/");
    revalidatePath("/accounts");
}
