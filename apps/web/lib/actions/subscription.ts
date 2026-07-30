"use server";

import { revalidatePath } from "next/cache";
import * as subscription from "@fintrack/core/subscription";
import { requireUserId } from "@/lib/action-session";

export async function getSubscriptionRequest() {
    const userId = await requireUserId();
    return subscription.getSubscriptionRequest(userId);
}

export async function submitInterestRequest() {
    const userId = await requireUserId();
    const request = await subscription.submitInterestRequest(userId);

    revalidatePath("/assistant");
    return request;
}
