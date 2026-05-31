import OpenAI from "openai";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { todayIso, type RawInbound, type TemplateResult } from "./types";

const llmSchema = z.object({
  amount: z.number().positive(),
  fee: z.number().nonnegative().default(0),
  direction: z.enum(["in", "out"]),
  currency: z.string().length(3).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  merchant: z.string().nullable(),
  refId: z.string().nullable(),
  balanceAfter: z.number().nullable(),
  accountHint: z.string().nullable(),
  description: z.string(),
});

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

/**
 * LLM fallback when no template matched. Uses gpt-4o-mini with strict JSON
 * output. Returns null if the API key is missing or the model declines.
 * Cost: ~$0.0002 per call at January 2025 prices.
 */
export async function extractWithLLM(raw: RawInbound): Promise<TemplateResult | null> {
  const openai = getClient();
  if (!openai) return null;

  const system = `You are a structured-data extractor for financial transaction notifications (SMS or email) sent to a user in Bangladesh.

Extract these fields from the message:
  amount       — number, always positive
  fee          — number, 0 if not mentioned
  direction    — "in" if money entered the user's account, "out" if it left
  currency     — ISO 4217 (BDT, USD, EUR…) or null if not stated
  date         — yyyy-MM-dd; null if not present (caller defaults to today)
  merchant     — counterparty (merchant, person, agent) or null
  refId        — provider transaction id / reference / TrxID / TxnId or null
  balanceAfter — the post-transaction balance the provider reports, or null
  accountHint  — a short lowercase token identifying which account this hits
                  (e.g. "bkash", "nagad", "ebl-1234"); null if unclear
  description  — a short human description (3–6 words)

If the message is not a transaction notification, return JSON {"not_a_transaction": true}.

Respond with ONLY JSON. No commentary.`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 400,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            `Source: ${raw.source}\nFrom: ${raw.fromAddress ?? "(unknown)"}\n` +
            (raw.subject ? `Subject: ${raw.subject}\n` : "") +
            `Body:\n${raw.body.slice(0, 2000)}`,
        },
      ],
    });

    const content = resp.choices[0]?.message?.content;
    if (!content) return null;
    const json = JSON.parse(content) as Record<string, unknown>;
    if (json["not_a_transaction"]) return null;

    const parsed = llmSchema.safeParse(json);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "LLM inbound extraction failed schema");
      return null;
    }
    const date = parsed.data.date ?? todayIso(raw.receivedAt);
    return {
      templateId: "llm.gpt-4o-mini",
      parsed: { ...parsed.data, date },
      confidence: 0.6,
    };
  } catch (err) {
    logger.warn({ err }, "LLM inbound extraction errored");
    return null;
  }
}
