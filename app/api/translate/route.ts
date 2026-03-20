import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { auth } from "@/lib/auth";
import { translateLimiter, LIMITS } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limit = translateLimiter(session.user.id);
  if (!limit.success) {
    return Response.json(
      { error: "Rate limit exceeded. Try again shortly.", retryAfterMs: limit.retryAfterMs },
      { status: 429 }
    );
  }

  const { text } = await req.json();
  if (!text || typeof text !== "string") {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }

  if (text.length > LIMITS.maxMessageLength) {
    return Response.json({ error: "Text too long" }, { status: 400 });
  }

  const { text: translated } = await generateText({
    model: openai("gpt-4o-mini"),
    system:
      "You are a translator. Translate the following Bangla text to English. Return ONLY the English translation, nothing else. If the text is already in English or is a mix, still return the full message in natural English.",
    prompt: text,
  });

  return Response.json({ translated });
}
