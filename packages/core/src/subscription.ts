import { db } from "@fintrack/db";
import { subscriptionRequests } from "@fintrack/db/schema";
import { and, desc, eq } from "drizzle-orm";

export async function getSubscriptionRequest(userId: string) {
    const [request] = await db
        .select()
        .from(subscriptionRequests)
        .where(eq(subscriptionRequests.userId, userId))
        .orderBy(desc(subscriptionRequests.createdAt))
        .limit(1);

    return request ?? null;
}

export async function submitInterestRequest(userId: string) {
    const [existing] = await db
        .select()
        .from(subscriptionRequests)
        .where(
            and(
                eq(subscriptionRequests.userId, userId),
                eq(subscriptionRequests.status, "pending")
            )
        )
        .limit(1);

    if (existing) {
        throw new Error("You already have a pending request");
    }

    const [request] = await db
        .insert(subscriptionRequests)
        .values({ userId })
        .returning();

    return request;
}
