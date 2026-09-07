"use server";

import * as chat from "@fintrack/core/chat";
import { requireUserId } from "@/lib/action-session";

export async function getChatHistory() {
    const userId = await requireUserId();
    return chat.getHistory(userId);
}

export async function clearChatHistory() {
    const userId = await requireUserId();
    await chat.clearHistory(userId);
}
