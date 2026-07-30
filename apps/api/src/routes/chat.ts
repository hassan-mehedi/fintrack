import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { handleChatStream } from "@mastra/ai-sdk";
import { RequestContext } from "@mastra/core/request-context";
import { createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@fintrack/db";
import { users } from "@fintrack/db/schema";
import { mastra } from "@fintrack/ai/mastra";
import { validateMessage } from "@fintrack/ai/guardrails";
import { LIMITS } from "@fintrack/ai/limits";
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

export async function chatRoutes(app: FastifyInstance) {
    app.post(
        "/chat",
        {
            preHandler: app.authenticate,
            config: { rateLimit: { max: LIMITS.chatMaxPerMin, timeWindow: "1 minute" } },
        },
        async (request, reply) => {
            const [user] = await db
                .select({ plan: users.plan, currency: users.currency })
                .from(users)
                .where(eq(users.id, request.user!.id))
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
            }

            const userCurrency = user.currency ?? "BDT";
            const currencyInfo = getCurrencyInfo(userCurrency);

            const requestContext = new RequestContext();
            requestContext.set("userId", request.user!.id);
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

            const stream = await handleChatStream({
                mastra,
                agentId: "financialAgent",
                params: {
                    ...params,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    messages: [currencySystemMessage, ...(params.messages ?? [])] as any,
                    requestContext,
                },
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = createUIMessageStreamResponse({ stream: stream as any });
            response.headers.forEach((value, key) => reply.header(key, value));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return reply.send(Readable.fromWeb(response.body as any));
        }
    );
}
