import { handleChatStream } from "@mastra/ai-sdk";
import { RequestContext } from "@mastra/core/request-context";
import { createUIMessageStreamResponse } from "ai";
import { mastra } from "@/lib/mastra";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { chatLimiter, isBodyTooLarge } from "@/lib/rate-limit";
import { validateMessage } from "@/lib/chat-guardrails";
import { getCurrencyInfo } from "@/lib/currencies";

export async function POST(req: Request) {
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

  const stream = await handleChatStream({
    mastra,
    agentId: "financialAgent",
    params: {
      ...params,
      messages,
      requestContext,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createUIMessageStreamResponse({ stream: stream as any });
}
