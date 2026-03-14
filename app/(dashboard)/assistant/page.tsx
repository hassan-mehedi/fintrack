import { auth } from "@/lib/auth";
import { getSubscriptionRequest } from "@/lib/actions/subscription";
import { redirect } from "next/navigation";
import { AssistantChat } from "./assistant-chat";
import { AssistantLocked } from "./assistant-locked";

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  if (session.user.plan === "pro") {
    return <AssistantChat />;
  }

  const request = await getSubscriptionRequest();

  return <AssistantLocked existingRequest={request} />;
}
