"use server";

import { revalidatePath } from "next/cache";
import * as accounts from "@fintrack/core/accounts";
import { requireUserId } from "@/lib/action-session";

const AFFECTED_PATHS = ["/dashboard", "/accounts", "/transactions", "/analytics"];

function revalidateAccountPages() {
    AFFECTED_PATHS.forEach((path) => revalidatePath(path));
}

export async function getAccounts(options?: { includeArchived?: boolean }) {
    const userId = await requireUserId();
    return accounts.getAccounts(userId, options);
}

export async function createAccount(data: unknown) {
    const userId = await requireUserId();
    const account = await accounts.createAccount(userId, data);

    revalidateAccountPages();
    return account;
}

export async function updateAccount(id: string, data: unknown) {
    const userId = await requireUserId();
    const account = await accounts.updateAccount(userId, id, data);

    revalidateAccountPages();
    return account;
}

export async function archiveAccount(id: string) {
    const userId = await requireUserId();
    const account = await accounts.archiveAccount(userId, id);

    revalidateAccountPages();
    return account;
}

export async function unarchiveAccount(id: string) {
    const userId = await requireUserId();
    const account = await accounts.unarchiveAccount(userId, id);

    revalidateAccountPages();
    return account;
}

export async function deleteAccount(id: string) {
    const userId = await requireUserId();
    await accounts.deleteAccount(userId, id);

    revalidateAccountPages();
}
