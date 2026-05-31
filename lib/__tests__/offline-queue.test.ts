import { describe, it, expect } from "vitest";
import { makeQueuedTransaction } from "@/lib/offline/queue";
import type { TransactionInput } from "@/lib/validators";

const base: TransactionInput = {
  accountId: "00000000-0000-0000-0000-000000000001",
  toAccountId: null,
  categoryId: "00000000-0000-0000-0000-000000000002",
  amount: "100",
  fee: "0",
  type: "expense",
  description: "Coffee",
  date: "2026-05-18",
  tags: [],
};

describe("makeQueuedTransaction", () => {
  it("assigns a stable idempotency key when payload lacks one", () => {
    const q = makeQueuedTransaction({ ...base });
    expect(q.id).toBeTruthy();
    expect(q.idempotencyKey).toBe(`offline:${q.id}`);
    expect(q.payload.idempotencyKey).toBe(q.idempotencyKey);
  });

  it("preserves a caller-supplied idempotency key", () => {
    const q = makeQueuedTransaction({ ...base, idempotencyKey: "user-supplied-123" });
    expect(q.idempotencyKey).toBe("user-supplied-123");
    expect(q.payload.idempotencyKey).toBe("user-supplied-123");
  });

  it("produces distinct ids per call", () => {
    const a = makeQueuedTransaction({ ...base });
    const b = makeQueuedTransaction({ ...base });
    expect(a.id).not.toBe(b.id);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it("initialises attempts to 0 and stamps enqueuedAt", () => {
    const before = Date.now();
    const q = makeQueuedTransaction({ ...base });
    const after = Date.now();
    expect(q.attempts).toBe(0);
    expect(q.enqueuedAt).toBeGreaterThanOrEqual(before);
    expect(q.enqueuedAt).toBeLessThanOrEqual(after);
  });

  it("survives JSON round-tripping (necessary for IndexedDB persistence)", () => {
    const q = makeQueuedTransaction({ ...base });
    const round = JSON.parse(JSON.stringify(q));
    expect(round).toEqual(q);
  });
});
