"use server";

import { compare, hash } from "bcryptjs";
import * as settings from "@fintrack/core/settings";
import { changePasswordSchema, type ChangePasswordInput } from "@fintrack/shared/validators";
import { requireUserId } from "@/lib/action-session";

export async function updateCurrency(currency: string) {
    const userId = await requireUserId();
    await settings.updateCurrency(userId, currency);
}

export async function changePassword(data: ChangePasswordInput) {
    const userId = await requireUserId();
    const parsed = changePasswordSchema.safeParse(data);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);

    const currentHash = await settings.getPasswordHash(userId);
    if (!(await compare(parsed.data.currentPassword, currentHash))) {
        throw new Error("Current password is incorrect");
    }

    await settings.setPasswordHash(userId, await hash(parsed.data.newPassword, 12));
}

export async function deleteAccount() {
    const userId = await requireUserId();
    await settings.deleteUser(userId);
}
