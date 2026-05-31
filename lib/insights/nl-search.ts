/**
 * Natural-language → structured-filter parser.
 *
 * The LLM emits a JSON object that maps onto `getTransactions`' filter shape.
 * We validate with Zod and refuse anything that doesn't match — no free-form
 * SQL or string interpolation ever reaches the database.
 */

import { z } from "zod";
import OpenAI from "openai";
import { logger } from "@/lib/logger";

export const nlFilterSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]).optional(),
  categoryName: z.string().optional(),
  accountName: z.string().optional(),
  merchant: z.string().optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().optional(),
  search: z.string().optional(),
});

export type NlFilter = z.infer<typeof nlFilterSchema>;

const SYSTEM_PROMPT = `You convert natural-language money queries into a JSON filter for a personal finance app's transaction list.

Output ONLY JSON matching this shape (omit fields you can't extract):
{
  "type": "income" | "expense" | "transfer",
  "categoryName": string,          // partial name; the server fuzzy-matches
  "accountName": string,           // partial name; the server fuzzy-matches
  "merchant": string,              // counterparty / merchant name
  "startDate": "YYYY-MM-DD",       // inclusive
  "endDate":   "YYYY-MM-DD",       // inclusive
  "minAmount": number,
  "maxAmount": number,
  "search": string                 // free-form fallback matched against description
}

Reference date for relative phrases ("last week", "this month"): the value of TODAY.

If the query isn't about transactions at all, respond with {}.

Don't invent fields. Don't add commentary. Just JSON.`;

function openai(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function parseNaturalLanguageQuery(
  query: string,
  today: string,
): Promise<NlFilter | null> {
  const client = openai();
  if (!client) return null;

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `TODAY=${today}\n\nQuery: ${query}` },
      ],
    });
    const content = resp.choices[0]?.message?.content;
    if (!content) return null;
    const json = JSON.parse(content) as Record<string, unknown>;
    const parsed = nlFilterSchema.safeParse(json);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, "NL search returned invalid shape");
      return null;
    }
    return parsed.data;
  } catch (err) {
    logger.warn({ err }, "NL search LLM call failed");
    return null;
  }
}
