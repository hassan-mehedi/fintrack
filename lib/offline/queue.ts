/**
 * IndexedDB-backed offline queue for transaction creation.
 *
 * When the browser is offline, the transaction form writes to this queue
 * instead of POSTing. A flusher (registered globally — see `flusher.ts`)
 * fires on every `online` event and on every visibilitychange-to-visible,
 * draining queued items one by one. Each item carries its own idempotency
 * key, so retrying a flush that partially succeeded is safe.
 *
 * Why not IndexedDB-only on the server side too? We want to keep the source
 * of truth in Postgres; this is purely a "draft" zone for things you
 * couldn't yet sync.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { TransactionInput } from "@/lib/validators";

const DB_NAME = "fintrack-offline";
const DB_VERSION = 1;
const STORE = "queued-transactions";

export type QueuedTransaction = {
  id: string; // local-only uuid, used as key
  idempotencyKey: string; // mirrored onto the server insert
  payload: TransactionInput;
  enqueuedAt: number; // ms epoch
  attempts: number;
  lastError?: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers — random-enough for an idempotency key.
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Pure helper: builds a fresh QueuedTransaction with a unique idempotency
 * key. Exposed for tests.
 */
export function makeQueuedTransaction(payload: TransactionInput): QueuedTransaction {
  const id = uuid();
  return {
    id,
    idempotencyKey: payload.idempotencyKey ?? `offline:${id}`,
    payload: { ...payload, idempotencyKey: payload.idempotencyKey ?? `offline:${id}` },
    enqueuedAt: Date.now(),
    attempts: 0,
  };
}

export async function enqueueTransaction(payload: TransactionInput): Promise<QueuedTransaction> {
  const db = await getDb();
  const item = makeQueuedTransaction(payload);
  await db.put(STORE, item);
  return item;
}

export async function listQueued(): Promise<QueuedTransaction[]> {
  const db = await getDb();
  return (await db.getAll(STORE)) as QueuedTransaction[];
}

export async function deleteQueued(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
}

export async function markAttempt(
  id: string,
  error?: string,
): Promise<QueuedTransaction | null> {
  const db = await getDb();
  const item = (await db.get(STORE, id)) as QueuedTransaction | undefined;
  if (!item) return null;
  item.attempts++;
  if (error) item.lastError = error;
  await db.put(STORE, item);
  return item;
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
}
