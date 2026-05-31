import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptField, decryptField } from "@/lib/2fa/encryption";

beforeAll(() => {
  // Tests run in isolation; ensure a key is set.
  if (!process.env.FIELD_ENC_KEY) {
    process.env.FIELD_ENC_KEY = randomBytes(32).toString("base64");
  }
});

describe("encryptField / decryptField", () => {
  it("round-trips arbitrary strings", () => {
    const inputs = ["", "hello", "JBSWY3DPEHPK3PXP", "🦊 mixed unicode 测试"];
    for (const s of inputs) {
      expect(decryptField(encryptField(s))).toBe(s);
    }
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    expect(encryptField("same")).not.toBe(encryptField("same"));
  });

  it("rejects tampered ciphertext", () => {
    const ct = encryptField("secret");
    // Flip the first ciphertext byte after the IV (12 bytes b64 ≈ 16 chars).
    const buf = Buffer.from(ct, "base64");
    buf[20] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decryptField(tampered)).toThrow();
  });

  it("rejects ciphertext that's too short", () => {
    expect(() => decryptField(Buffer.from("short").toString("base64"))).toThrow();
  });
});
