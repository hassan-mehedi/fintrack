import { db } from "@fintrack/db";
import { chatConversations, chatMessages } from "@fintrack/db/schema";
import { asc, desc, eq } from "drizzle-orm";

export type ChatRole = "user" | "assistant";

export interface ChatMessageInput {
    role: ChatRole;
    parts: unknown;
}

export interface StoredChatMessage {
    id: string;
    role: ChatRole;
    parts: unknown;
}

const TITLE_MAX_LENGTH = 60;

function extractText(parts: unknown): string {
    if (!Array.isArray(parts)) return "";
    return parts
        .filter(
            (p): p is { type: "text"; text: string } =>
                typeof p === "object" &&
                p !== null &&
                (p as { type?: unknown }).type === "text" &&
                typeof (p as { text?: unknown }).text === "string"
        )
        .map((p) => p.text)
        .join(" ")
        .trim();
}

export async function getActiveConversation(userId: string) {
    const [conversation] = await db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.userId, userId))
        .orderBy(desc(chatConversations.updatedAt))
        .limit(1);

    return conversation ?? null;
}

export async function getHistory(userId: string): Promise<StoredChatMessage[]> {
    const conversation = await getActiveConversation(userId);
    if (!conversation) return [];

    return db
        .select({
            id: chatMessages.id,
            role: chatMessages.role,
            parts: chatMessages.parts,
        })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conversation.id))
        .orderBy(asc(chatMessages.createdAt));
}

export async function appendMessages(userId: string, messages: ChatMessageInput[]) {
    if (messages.length === 0) return;

    let conversation = await getActiveConversation(userId);
    if (!conversation) {
        [conversation] = await db
            .insert(chatConversations)
            .values({ userId })
            .returning();
    }

    const now = new Date();
    await db.insert(chatMessages).values(
        messages.map((m, i) => ({
            conversationId: conversation.id,
            role: m.role,
            parts: m.parts,
            createdAt: new Date(now.getTime() + i),
        }))
    );

    const firstUserText = messages
        .filter((m) => m.role === "user")
        .map((m) => extractText(m.parts))
        .find((text) => text.length > 0);
    const title =
        conversation.title === null && firstUserText
            ? firstUserText.slice(0, TITLE_MAX_LENGTH)
            : conversation.title;

    await db
        .update(chatConversations)
        .set({ title, updatedAt: now })
        .where(eq(chatConversations.id, conversation.id));
}

export async function clearHistory(userId: string) {
    await db.delete(chatConversations).where(eq(chatConversations.userId, userId));
}
