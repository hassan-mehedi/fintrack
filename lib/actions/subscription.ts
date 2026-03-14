"use server";

import { db } from "@/lib/db";
import { subscriptionRequests } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function getSubscriptionRequest() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [request] = await db
    .select()
    .from(subscriptionRequests)
    .where(eq(subscriptionRequests.userId, session.user.id))
    .orderBy(subscriptionRequests.createdAt)
    .limit(1);

  return request ?? null;
}

export async function submitInterestRequest() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [existing] = await db
    .select()
    .from(subscriptionRequests)
    .where(
      and(
        eq(subscriptionRequests.userId, session.user.id),
        eq(subscriptionRequests.status, "pending")
      )
    )
    .limit(1);

  if (existing) {
    throw new Error("You already have a pending request");
  }

  const [request] = await db
    .insert(subscriptionRequests)
    .values({
      userId: session.user.id,
    })
    .returning();

  revalidatePath("/assistant");
  return request;
}
