import { describe, it, expect } from "vitest";
import { generateSecret, verifyTotp, currentTotpFor } from "@/lib/2fa/totp";

describe("generateSecret", () => {
  it("returns a non-empty base32 string", () => {
    const s = generateSecret();
    expect(s.length).toBeGreaterThanOrEqual(16);
    expect(/^[A-Z2-7]+$/.test(s)).toBe(true);
  });

  it("produces a different secret per call (overwhelmingly likely)", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

describe("verifyTotp", () => {
  const secret = "JBSWY3DPEHPK3PXP";

  it("accepts a fresh code generated from the same secret", () => {
    const token = currentTotpFor(secret);
    expect(verifyTotp(secret, token)).toBe(true);
  });

  it("rejects an obviously wrong code", () => {
    const token = currentTotpFor(secret);
    // Pick a fixed code that differs from the current valid one.
    const candidates = ["000000", "999999", "123456", "654321"];
    const wrong = candidates.find((c) => c !== token)!;
    expect(verifyTotp(secret, wrong)).toBe(false);
  });

  it("rejects non-six-digit input", () => {
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "1234567")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });

  it("rejects whitespace input gracefully", () => {
    expect(verifyTotp(secret, "   ")).toBe(false);
    expect(verifyTotp(secret, "123 456")).toBe(false);
  });

  it("doesn't throw on garbage secret", () => {
    expect(() => verifyTotp("not-a-secret", "123456")).not.toThrow();
  });
});
