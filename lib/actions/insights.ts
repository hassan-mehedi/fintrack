"use server";

import { db } from "@/lib/db";
import { insights } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export async function listInsights(opts?: { limit?: number; includeDismissed?: boolean }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const limit = opts?.limit ?? 20;

  const conds = [eq(insights.userId, session.user.id)];
  if (!opts?.includeDismissed) conds.push(isNull(insights.dismissedAt));

  const rows = await db
    .select({
      id: insights.id,
      kind: insights.kind,
      severity: insights.severity,
      title: insights.title,
      body: insights.body,
      payload: insights.payload,
      dismissedAt: insights.dismissedAt,
      createdAt: insights.createdAt,
    })
    .from(insights)
    .where(and(...conds))
    .orderBy(desc(insights.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  // Re-sort by severity first, then recency.
  return rows.sort((a, b) => {
    const ra = SEVERITY_RANK[a.severity] ?? 9;
    const rb = SEVERITY_RANK[b.severity] ?? 9;
    if (ra !== rb) return ra - rb;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function dismissInsight(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await db
    .update(insights)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(insights.id, id),
        eq(insights.userId, session.user.id),
        isNull(insights.dismissedAt),
      ),
    );
  revalidatePath("/dashboard");
}

export async function restoreInsight(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await db
    .update(insights)
    .set({ dismissedAt: null })
    .where(and(eq(insights.id, id), eq(insights.userId, session.user.id)));
  revalidatePath("/dashboard");
}
