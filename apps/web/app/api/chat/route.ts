import { handleChatStream } from "@mastra/ai-sdk";
import { RequestContext } from "@mastra/core/request-context";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { mastra } from "@fintrack/ai/mastra";
import { auth } from "@/lib/auth";
import { db } from "@fintrack/db";
import { users } from "@fintrack/db/schema";
import { eq } from "drizzle-orm";
import { chatLimiter, isBodyTooLarge } from "@/lib/rate-limit";
import { validateMessage } from "@fintrack/ai/guardrails";
import { getCurrencyInfo } from "@fintrack/shared/currencies";
import { logger } from "@/lib/logger";
import { appendMessages } from "@fintrack/core/chat";

function hasText(parts: unknown): boolean {
  return (
    Array.isArray(parts) &&
    parts.some((p) => p.type === "text" && typeof p.text === "string" && p.text.trim())
  );
}

async function persist(userId: string, role: "user" | "assistant", parts: unknown) {
  if (!hasText(parts)) return;
  try {
    await appendMessages(userId, [{ role, parts }]);
  } catch (err) {
    logger.error({ path: "/api/chat", role, err }, "failed to persist chat message");
  }
}

export async function POST(req: Request) {
  const start = Date.now();
  logger.info({ method: "POST", path: "/api/chat" }, "request received");

  if (isBodyTooLarge(req)) {
    return Response.json({ error: "Request body too large" }, { status: 413 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [user] = await db
    .select({ plan: users.plan, currency: users.currency })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user || user.plan !== "pro") {
    return new Response("Pro plan required", { status: 403 });
  }

  const limit = await chatLimiter(session.user.id);
  if (!limit.success) {
    return Response.json(
      { error: "Too many messages. Please wait a moment.", retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    );
  }

  const params = await req.json();

  // Validate the latest user message
  const lastUserMessage = [...(params.messages ?? [])]
    .reverse()
    .find((m: { role: string }) => m.role === "user");
  if (lastUserMessage) {
    // Handle both AI SDK formats: `content` (string | array) and `parts` (array)
    let text = "";
    if (typeof lastUserMessage.content === "string") {
      text = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      text = lastUserMessage.content
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join(" ");
    } else if (Array.isArray(lastUserMessage.parts)) {
      text = lastUserMessage.parts
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join(" ");
    }

    if (text) {
      const validation = validateMessage(text);
      if (!validation.valid) {
        return Response.json({ error: validation.error }, { status: 400 });
      }
    }

    await persist(session.user.id, "user", lastUserMessage.parts);
  }

  const userCurrency = user.currency ?? "BDT";
  const currencyInfo = getCurrencyInfo(userCurrency);

  const requestContext = new RequestContext();
  requestContext.set("userId", session.user.id);
  requestContext.set("userCurrency", userCurrency);

  // Prepend a system message with the user's currency context
  const currencySystemMessage = {
    role: "system",
    content: `The user's currency is ${currencyInfo.code} (${currencyInfo.symbol}). Always format monetary amounts using ${currencyInfo.code}. For example, use "${currencyInfo.symbol}1,234.56" format.`,
  };
  const messages = [currencySystemMessage, ...(params.messages ?? [])];

  const agentStream = await handleChatStream({
    mastra,
    agentId: "financialAgent",
    params: {
      ...params,
      messages,
      requestContext,
    },
  });

  const userId = session.user.id;
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writer.merge(agentStream as any);
    },
    onFinish: ({ responseMessage }) =>
      persist(userId, "assistant", responseMessage.parts),
  });

  logger.info({ method: "POST", path: "/api/chat", status: 200, duration: Date.now() - start }, "request completed");
  return createUIMessageStreamResponse({ stream });
}
