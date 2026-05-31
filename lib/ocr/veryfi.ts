/**
 * Veryfi receipt OCR client.
 *
 * Free tier: 100 documents per month, perpetual, no credit card.
 *
 * Required env vars:
 *   VERYFI_CLIENT_ID
 *   VERYFI_CLIENT_SECRET
 *   VERYFI_USERNAME
 *   VERYFI_API_KEY
 *
 * Docs: https://docs.veryfi.com/api/receipts-invoices/process-a-document/
 */

const VERYFI_ENDPOINT = "https://api.veryfi.com/api/v8/partner/documents";

type VeryfiLineItem = {
  description?: string | null;
  quantity?: number | null;
  total?: number | null;
  price?: number | null;
};

export type VeryfiRaw = {
  id?: number;
  date?: string;
  vendor?: { name?: string | null; raw_name?: string | null };
  total?: number | null;
  subtotal?: number | null;
  tax?: number | null;
  currency_code?: string | null;
  payment?: { type?: string | null };
  category?: string | null;
  line_items?: VeryfiLineItem[];
  ocr_text?: string | null;
};

export type ParsedReceipt = {
  amount: number | null;
  date: string | null;
  merchantName: string | null;
  currency: string | null;
  tax: number | null;
  subtotal: number | null;
  paymentType: string | null;
  category: string | null;
  lineItems: Array<{
    description: string;
    quantity: number | null;
    total: number | null;
  }>;
  raw: VeryfiRaw;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

/**
 * Submit a base64-encoded document to Veryfi for processing. Returns the
 * raw API response — pass it through `parseVeryfi` for the normalised shape.
 */
export async function processDocument(args: {
  fileBytes: Uint8Array;
  filename: string;
}): Promise<VeryfiRaw> {
  const clientId = requireEnv("VERYFI_CLIENT_ID");
  const apiKey = requireEnv("VERYFI_API_KEY");
  const username = requireEnv("VERYFI_USERNAME");

  const fileDataBase64 = Buffer.from(args.fileBytes).toString("base64");

  const res = await fetch(VERYFI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CLIENT-ID": clientId,
      Authorization: `apikey ${username}:${apiKey}`,
    },
    body: JSON.stringify({
      file_name: args.filename,
      file_data: fileDataBase64,
      auto_delete: 1,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`veryfi ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as VeryfiRaw;
}

/**
 * Normalise a Veryfi response into a stable internal shape. Pure; safe to test.
 */
export function parseVeryfi(raw: VeryfiRaw): ParsedReceipt {
  const merchantName =
    raw.vendor?.name?.trim() || raw.vendor?.raw_name?.trim() || null;

  // Veryfi returns date strings like "2024-08-12 15:32:00". We want yyyy-MM-dd.
  let date: string | null = null;
  if (raw.date) {
    const m = raw.date.match(/^\d{4}-\d{2}-\d{2}/);
    date = m ? m[0] : null;
  }

  const lineItems = Array.isArray(raw.line_items)
    ? raw.line_items
        .filter((li) => li && (li.description || li.total))
        .map((li) => ({
          description: (li.description ?? "").trim(),
          quantity: typeof li.quantity === "number" ? li.quantity : null,
          total: typeof li.total === "number" ? li.total : null,
        }))
    : [];

  return {
    amount: typeof raw.total === "number" ? raw.total : null,
    date,
    merchantName,
    currency: raw.currency_code ?? null,
    tax: typeof raw.tax === "number" ? raw.tax : null,
    subtotal: typeof raw.subtotal === "number" ? raw.subtotal : null,
    paymentType: raw.payment?.type ?? null,
    category: raw.category ?? null,
    lineItems,
    raw,
  };
}
