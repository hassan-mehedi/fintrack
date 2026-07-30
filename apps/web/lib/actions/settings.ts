"use server";

import * as settings from "@fintrack/core/settings";
import { requireUserId } from "@/lib/action-session";

export async function updateCurrency(currency: string) {
    const userId = await requireUserId();
    await settings.updateCurrency(userId, currency);
}
