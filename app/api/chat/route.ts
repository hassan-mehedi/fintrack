import { handleChatStream } from "@mastra/ai-sdk";
import { RequestContext } from "@mastra/core/request-context";
import { createUIMessageStreamResponse } from "ai";
import { mastra } from "@/lib/mastra";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user || user.plan !== "pro") {
    return new Response("Pro plan required", { status: 403 });
  }

  const params = await req.json();

  const requestContext = new RequestContext();
  requestContext.set("userId", session.user.id);

  const stream = await handleChatStream({
    mastra,
    agentId: "financialAgent",
    params: {
      ...params,
      requestContext,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createUIMessageStreamResponse({ stream: stream as any });
}
