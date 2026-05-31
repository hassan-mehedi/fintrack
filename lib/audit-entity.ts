import { db } from "@/lib/db";
import { entityChanges } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

export type EntityName =
  | "transaction"
  | "account"
  | "category"
  | "budget"
  | "recurring_transaction"
  | "merchant";

export type EntityAction = "create" | "update" | "delete" | "restore";

type Context = {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  source?: string | null;
};

/**
 * Records an entity change. Failure is logged but never thrown — the audit
 * trail is best-effort and must not break the user's write.
 */
export async function recordChange(args: {
  ctx: Context;
  entity: EntityName;
  entityId: string;
  action: EntityAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}): Promise<void> {
  const diff = computeDiff(args.before ?? null, args.after ?? null);
  try {
    await db.insert(entityChanges).values({
      userId: args.ctx.userId,
      entity: args.entity,
      entityId: args.entityId,
      action: args.action,
      before: args.before ?? null,
      after: args.after ?? null,
      diff: diff ?? null,
      ipAddress: args.ctx.ipAddress ?? null,
      userAgent: args.ctx.userAgent ?? null,
      source: args.ctx.source ?? null,
    });
  } catch (err) {
    logger.warn({ err, entity: args.entity, entityId: args.entityId }, "entity audit write failed");
  }
}

/**
 * Wrap a server action that creates/updates/deletes an entity. `loadBefore`
 * is called before the mutation; `runMutation` performs it and returns the
 * resulting row; the diff is then captured automatically.
 */
export async function withEntityAudit<T extends { id: string }>(args: {
  ctx: Context;
  entity: EntityName;
  action: EntityAction;
  loadBefore?: () => Promise<Record<string, unknown> | null>;
  run: () => Promise<T>;
}): Promise<T> {
  const before = args.loadBefore ? await args.loadBefore() : null;
  const after = await args.run();
  await recordChange({
    ctx: args.ctx,
    entity: args.entity,
    entityId: after.id,
    action: args.action,
    before,
    after: after as unknown as Record<string, unknown>,
  });
  return after;
}

function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!before || !after) return null;
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (!isEqual(a, b)) out[k] = { from: a, to: b };
  }
  return Object.keys(out).length ? out : null;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => isEqual(v, b[i]));
  }
  return false;
}
