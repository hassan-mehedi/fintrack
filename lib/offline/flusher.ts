"use client";

/**
 * Drains the offline queue. Called:
 *   - On every successful `online` event from window
 *   - On every visibilitychange where the tab becomes visible
 *   - Immediately on app load (in case a previous tab was offline)
 *
 * Uses `createTransaction` directly (not /api/*). Each item carries its own
 * idempotency key so flushing twice doesn't create duplicates.
 */

import { createTransaction } from "@/lib/actions/transactions";
import { deleteQueued, listQueued, markAttempt } from "./queue";

const MAX_ATTEMPTS = 5;

let flushing = false;

export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  if (flushing) return { flushed: 0, failed: 0 };
  flushing = true;
  let flushed = 0;
  let failed = 0;
  try {
    const items = await listQueued();
    for (const item of items) {
      if (item.attempts >= MAX_ATTEMPTS) {
        failed++;
        continue;
      }
      try {
        await createTransaction(item.payload);
        await deleteQueued(item.id);
        flushed++;
      } catch (err) {
        await markAttempt(item.id, err instanceof Error ? err.message : String(err));
        failed++;
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, failed };
}

let installed = false;

/**
 * Idempotent — call this once at app start. Wires the global listeners that
 * drain the queue when the network or the tab comes back.
 */
export function installOfflineFlusher(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const tryFlush = () => {
    if (!navigator.onLine) return;
    void flushQueue();
  };

  window.addEventListener("online", tryFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryFlush();
  });
  // Try once on install.
  tryFlush();
}
