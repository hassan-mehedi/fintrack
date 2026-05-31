import { describe, it, expect } from "vitest";
import { compare } from "bcryptjs";
import {
  generateRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "@/lib/2fa/recovery";

describe("generateRecoveryCode", () => {
  it("returns four groups of four chars separated by dashes", () => {
    const c = generateRecoveryCode();
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("avoids ambiguous characters (0/O/1/I)", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateRecoveryCode();
      expect(c).not.toMatch(/[01OI]/);
    }
  });

  it("doesn't repeat itself (overwhelmingly likely)", () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });
});

describe("generateRecoveryCodes", () => {
  it("returns the default count", () => {
    expect(generateRecoveryCodes()).toHaveLength(RECOVERY_CODE_COUNT);
  });

  it("returns N when explicitly requested", () => {
    expect(generateRecoveryCodes(3)).toHaveLength(3);
  });

  it("returns all distinct values", () => {
    const codes = generateRecoveryCodes(20);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("normalizeRecoveryCode", () => {
  it("strips dashes and uppercases", () => {
    expect(normalizeRecoveryCode("abcd-1234-efgh-5678")).toBe("ABCD1234EFGH5678");
  });

  it("strips internal whitespace", () => {
    expect(normalizeRecoveryCode("ABCD 1234 EFGH 5678")).toBe("ABCD1234EFGH5678");
  });

  it("leaves an already-canonical code unchanged", () => {
    expect(normalizeRecoveryCode("ABCD1234EFGH5678")).toBe("ABCD1234EFGH5678");
  });
});

describe("hashRecoveryCode", () => {
  it("hashes the canonical form so dashed/spaced inputs round-trip", async () => {
    const original = "ABCD-1234-EFGH-5678";
    const hash = await hashRecoveryCode(original);

    // The hash matches the canonical (normalised) plaintext.
    expect(await compare("ABCD1234EFGH5678", hash)).toBe(true);
    // It also matches the original input via normalize-then-compare.
    expect(await compare(normalizeRecoveryCode(original), hash)).toBe(true);

    // A different code does not match.
    expect(await compare("ZZZZ9999ZZZZ9999", hash)).toBe(false);
  });
});
