import { auth } from "@/lib/auth";
import { isVoiceInputAvailable } from "@fintrack/ai/provider";
import type { UIMessage } from "ai";
import { getSubscriptionRequest } from "@/lib/actions/subscription";
import { getChatHistory } from "@/lib/actions/chat";
import { redirect } from "next/navigation";
import { AssistantChat } from "./assistant-chat";
import { AssistantLocked } from "./assistant-locked";

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (session.user.plan === "pro") {
    const history = await getChatHistory();
    return (
      <AssistantChat
        voiceEnabled={isVoiceInputAvailable()}
        initialMessages={history as UIMessage[]}
      />
    );
  }

  const request = await getSubscriptionRequest();

  return <AssistantLocked existingRequest={request} />;
}
