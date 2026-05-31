/**
 * Field-level encryption for sensitive secrets at rest (TOTP shared keys).
 * Uses AES-256-GCM via Node's built-in `crypto` — no external dependency.
 *
 * Env:
 *   FIELD_ENC_KEY — 32 raw bytes, base64-encoded. Generate once with:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Format on disk (base64-encoded): IV (12 bytes) | ciphertext | authTag (16 bytes).
 * Anyone holding FIELD_ENC_KEY can decrypt; without it, the ciphertext is
 * unrecoverable. Treat key rotation as out of scope for v1 — losing the key
 * means every user must re-enrol 2FA.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

function loadKey(): Buffer {
  const b64 = process.env.FIELD_ENC_KEY;
  if (!b64) throw new Error("FIELD_ENC_KEY is not set");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error("FIELD_ENC_KEY must decode to exactly 32 bytes");
  }
  return buf;
}

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) cachedKey = loadKey();
  return cachedKey;
}

export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

export function decryptField(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error("ciphertext too short");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ct = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
