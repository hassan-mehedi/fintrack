import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { handleChatStream } from "@mastra/ai-sdk";
import { RequestContext } from "@mastra/core/request-context";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@fintrack/db";
import { users } from "@fintrack/db/schema";
import { mastra } from "@fintrack/ai/mastra";
import { validateMessage } from "@fintrack/ai/guardrails";
import { LIMITS } from "@fintrack/ai/limits";
import { appendMessages, clearHistory, getHistory } from "@fintrack/core/chat";
import { getCurrencyInfo } from "@fintrack/shared/currencies";

interface UIMessageLike {
    role: string;
    content?: string | { type: string; text?: string }[];
    parts?: { type: string; text?: string }[];
}

function extractText(message: UIMessageLike): string {
    if (typeof message.content === "string") return message.content;
    const parts = Array.isArray(message.content) ? message.content : message.parts;
    if (!Array.isArray(parts)) return "";
    return parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text)
        .join(" ");
}

function hasText(parts: unknown): boolean {
    return (
        Array.isArray(parts) &&
        parts.some((p) => p.type === "text" && typeof p.text === "string" && p.text.trim())
    );
}

export async function chatRoutes(app: FastifyInstance) {
    const persist = async (userId: string, role: "user" | "assistant", parts: unknown) => {
        if (!hasText(parts)) return;
        try {
            await appendMessages(userId, [{ role, parts }]);
        } catch (err) {
            app.log.error({ err, role }, "failed to persist chat message");
        }
    };

    app.get("/chat/history", { preHandler: app.authenticate }, async (request) => {
        return getHistory(request.user!.id);
    });

    app.delete("/chat/history", { preHandler: app.authenticate }, async (request, reply) => {
        await clearHistory(request.user!.id);
        return reply.code(204).send();
    });

    app.post(
        "/chat",
        {
            preHandler: app.authenticate,
            config: { rateLimit: { max: LIMITS.chatMaxPerMin, timeWindow: "1 minute" } },
        },
        async (request, reply) => {
            const userId = request.user!.id;
            const [user] = await db
                .select({ plan: users.plan, currency: users.currency })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            if (!user || user.plan !== "pro") {
                return reply.code(403).send({ error: "Pro plan required" });
            }

            const params = request.body as { messages?: UIMessageLike[] };

            const lastUserMessage = [...(params.messages ?? [])]
                .reverse()
                .find((m) => m.role === "user");
            if (lastUserMessage) {
                const text = extractText(lastUserMessage);
                if (text) {
                    const validation = validateMessage(text);
                    if (!validation.valid) {
                        return reply.code(400).send({ error: validation.error });
                    }
                }
                await persist(userId, "user", lastUserMessage.parts);
            }

            const userCurrency = user.currency ?? "BDT";
            const currencyInfo = getCurrencyInfo(userCurrency);

            const requestContext = new RequestContext();
            requestContext.set("userId", userId);
            requestContext.set("userCurrency", userCurrency);

            const currencySystemMessage = {
                id: "system-currency",
                role: "system",
                parts: [
                    {
                        type: "text",
                        text: `The user's currency is ${currencyInfo.code} (${currencyInfo.symbol}). Always format monetary amounts using ${currencyInfo.code}. For example, use "${currencyInfo.symbol}1,234.56" format.`,
                    },
                ],
            };

            const agentStream = await handleChatStream({
                mastra,
                agentId: "financialAgent",
                params: {
                    ...params,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    messages: [currencySystemMessage, ...(params.messages ?? [])] as any,
                    requestContext,
                },
            });

            const stream = createUIMessageStream({
                execute: ({ writer }) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    writer.merge(agentStream as any);
                },
                onFinish: ({ responseMessage }) =>
                    persist(userId, "assistant", responseMessage.parts),
            });

            const response = createUIMessageStreamResponse({ stream });
            response.headers.forEach((value, key) => reply.header(key, value));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return reply.send(Readable.fromWeb(response.body as any));
        }
    );
}
