import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { chatLimiter, isBodyTooLarge } from "@/lib/rate-limit";
import { validateMessage } from "@/lib/chat-guardrails";
import { logger } from "@/lib/logger";
import {
  buildFinancialAssistantInstructions,
  createFinancialAssistantTools,
} from "@/lib/ai/financial-assistant";

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
  const rawMessages = Array.isArray(params.messages) ? params.messages : [];

  // Validate the latest user message
  const lastUserMessage = [...rawMessages]
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
  const messages = await convertToModelMessages(rawMessages as UIMessage[]);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: buildFinancialAssistantInstructions(userCurrency),
    messages,
    tools: createFinancialAssistantTools({
      userId: session.user.id,
      userCurrency,
    }),
    stopWhen: stepCountIs(8),
    onError(error) {
      logger.error({ err: error }, "chat stream failed");
    },
  });

  logger.info({ method: "POST", path: "/api/chat", status: 200, duration: Date.now() - start }, "request completed");
  return result.toUIMessageStreamResponse({
    onError: () => "The assistant could not complete this request.",
  });
}
