import { describe, it, expect } from "vitest";
import { runTemplates } from "@/lib/inbound/templates";
import type { RawInbound } from "@/lib/inbound/types";

function sms(body: string, sender = "bkash"): RawInbound {
  return {
    source: "sms",
    fromAddress: sender,
    subject: null,
    body,
    receivedAt: new Date("2024-03-12T08:30:00Z"),
  };
}

function email(body: string, from: string, subject = "Transaction Alert"): RawInbound {
  return {
    source: "email",
    fromAddress: from,
    subject,
    body,
    receivedAt: new Date("2024-03-12T08:30:00Z"),
  };
}

describe("bKash SMS", () => {
  it("parses Send Money (out) with fee + balance + ref", () => {
    const r = runTemplates(
      sms(
        "Send Money Tk 1,000.00 to 01711223344 successful. Fee Tk 5.00. Balance Tk 4,000.00. TrxID 8XY4Z5Q at 12/03/2024 14:30",
      ),
    );
    expect(r?.templateId).toBe("bkash.sms.v1");
    expect(r?.parsed.direction).toBe("out");
    expect(r?.parsed.amount).toBe(1000);
    expect(r?.parsed.fee).toBe(5);
    expect(r?.parsed.balanceAfter).toBe(4000);
    expect(r?.parsed.refId).toBe("8XY4Z5Q");
    expect(r?.parsed.date).toBe("2024-03-12");
    expect(r?.parsed.accountHint).toBe("bkash");
  });

  it("parses Cash In (in)", () => {
    const r = runTemplates(
      sms(
        "Cash In Tk 5,000.00 from agent 01711223344 successful. Available Balance: Tk 12,345.67. TrxID 8X4Y5Z6Q7 at 12/03/2024 14:22",
      ),
    );
    expect(r?.parsed.direction).toBe("in");
    expect(r?.parsed.amount).toBe(5000);
    expect(r?.parsed.balanceAfter).toBe(12345.67);
    expect(r?.parsed.refId).toBe("8X4Y5Z6Q7");
  });

  it("parses Payment to merchant (out)", () => {
    const r = runTemplates(
      sms("Your Payment Tk 500.00 to STARBUCKS GULSHAN is successful. Available Balance Tk 4,500.00. TrxID 1A2B3C4D5"),
    );
    expect(r?.parsed.direction).toBe("out");
    expect(r?.parsed.amount).toBe(500);
    expect(r?.parsed.merchant).toContain("STARBUCKS");
    expect(r?.parsed.refId).toBe("1A2B3C4D5");
  });
});

describe("Nagad SMS", () => {
  it("parses Send Money", () => {
    const r = runTemplates(
      sms(
        "Nagad: Send Money TK 1,000 to 01711223344 successful. TxnID: NX1234567",
        "NAGAD",
      ),
    );
    expect(r?.templateId).toBe("nagad.sms.v1");
    expect(r?.parsed.direction).toBe("out");
    expect(r?.parsed.amount).toBe(1000);
    expect(r?.parsed.refId).toBe("NX1234567");
  });

  it("parses Cash In with balance", () => {
    const r = runTemplates(
      sms(
        "Nagad: Cash In TK 5,000 from agent 01711223344. Balance TK 12,345.50. TxnID: NX2345678",
        "NAGAD",
      ),
    );
    expect(r?.parsed.direction).toBe("in");
    expect(r?.parsed.amount).toBe(5000);
    expect(r?.parsed.balanceAfter).toBe(12345.5);
  });
});

describe("Rocket SMS", () => {
  it("parses Cash Out with fee + balance", () => {
    const r = runTemplates(
      sms(
        "Bal: TK 1,234.56. Cash Out: TK 100.00 to 01711223344. Chrg: TK 1.85. TxnId: A1B2C3D4. 12-Mar-2024 14:30",
        "DBBL",
      ),
    );
    expect(r?.templateId).toBe("rocket.sms.v1");
    expect(r?.parsed.direction).toBe("out");
    expect(r?.parsed.amount).toBe(100);
    expect(r?.parsed.fee).toBe(1.85);
    expect(r?.parsed.balanceAfter).toBe(1234.56);
    expect(r?.parsed.refId).toBe("A1B2C3D4");
    expect(r?.parsed.date).toBe("2024-03-12");
  });
});

describe("Upay SMS", () => {
  it("parses Send Money", () => {
    const r = runTemplates(
      sms(
        "Upay: Send Money BDT 1,000.00 to 01711223344. Bal: BDT 4,000.00. TxID UPAY12345 at 12/03/2024 14:30",
        "UPAY",
      ),
    );
    expect(r?.templateId).toBe("upay.sms.v1");
    expect(r?.parsed.amount).toBe(1000);
    expect(r?.parsed.balanceAfter).toBe(4000);
    expect(r?.parsed.refId).toBe("UPAY12345");
  });
});

describe("City Bank", () => {
  it("parses card-purchase email", () => {
    const r = runTemplates(
      email(
        "Dear Customer, your card ending 1234 has been used for BDT 2,500.00 at STARBUCKS GULSHAN on 12-Mar-2024 14:30. Available balance BDT 25,000.00. Ref: 9X8Y7Z6Q",
        "alerts@thecitybank.com",
      ),
    );
    expect(r?.templateId).toBe("citybank.v1");
    expect(r?.parsed.amount).toBe(2500);
    expect(r?.parsed.merchant).toContain("STARBUCKS");
    expect(r?.parsed.balanceAfter).toBe(25000);
    expect(r?.parsed.refId).toBe("9X8Y7Z6Q");
    expect(r?.parsed.accountHint).toBe("citybank-1234");
  });
});

describe("EBL", () => {
  it("parses debit alert", () => {
    const r = runTemplates(
      email(
        "Dear Customer, Your A/C XXX0987 has been debited BDT 1,234.56 on 12-Mar-2024 for POS Purchase at MERCHANT NAME. Available Balance: BDT 25,000.00. Ref: 9X8Y7Z.",
        "alerts@ebl.com.bd",
        "EBL Skybanking Alert",
      ),
    );
    expect(r?.templateId).toBe("ebl.v1");
    expect(r?.parsed.direction).toBe("out");
    expect(r?.parsed.amount).toBe(1234.56);
    expect(r?.parsed.balanceAfter).toBe(25000);
    expect(r?.parsed.merchant).toContain("MERCHANT");
    expect(r?.parsed.accountHint).toContain("ebl");
  });

  it("parses credit alert", () => {
    const r = runTemplates(
      email(
        "Dear Customer, Your A/C XXX0987 has been credited BDT 5,000.00 on 12-Mar-2024 from Salary Disbursement. Available Balance: BDT 30,000.00. Ref: SAL2024.",
        "alerts@ebl.com.bd",
      ),
    );
    expect(r?.parsed.direction).toBe("in");
  });
});

describe("Generic card alert (fallback)", () => {
  it("catches unknown bank email when keywords present", () => {
    const r = runTemplates(
      email(
        "Your card ending 4321 was charged BDT 500.00 at COFFEE WORLD on 12-Mar-2024. Bal: BDT 10,000.00. Ref: ABC123.",
        "alerts@unknownbank.com",
      ),
    );
    expect(r?.templateId).toBe("generic.card.v1");
    expect(r?.confidence).toBeLessThan(0.95);
    expect(r?.parsed.amount).toBe(500);
  });
});

describe("Non-matches", () => {
  it("returns null for a non-transaction message", () => {
    const r = runTemplates(sms("Your OTP for login is 123456. Do not share."));
    expect(r).toBeNull();
  });
});
