/**
 * Weekly spending digest. One gpt-4o-mini call per user, costs cents/week.
 * Falls back to a deterministic summary if the API key is missing.
 */

import { db } from "@/lib/db";
import { transactions, categories } from "@/lib/db/schema";
import { and, eq, gte, lte, isNull, sql, desc } from "drizzle-orm";
import { format, subDays } from "date-fns";
import OpenAI from "openai";
import { logger } from "@/lib/logger";
import type { InsightDraft } from "./anomalies";

function openai(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

type WeekStats = {
  thisWeek: { totalExpense: number; byCategory: Array<{ name: string; total: number }> };
  lastWeek: { totalExpense: number; byCategory: Array<{ name: string; total: number }> };
};

async function loadWeekStats(userId: string, refDate: Date): Promise<WeekStats> {
  const thisStart = format(subDays(refDate, 7), "yyyy-MM-dd");
  const thisEnd = format(refDate, "yyyy-MM-dd");
  const lastStart = format(subDays(refDate, 14), "yyyy-MM-dd");
  const lastEnd = format(subDays(refDate, 8), "yyyy-MM-dd");

  const fetchWeek = async (from: string, to: string) => {
    const byCat = await db
      .select({
        name: categories.name,
        total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric), 0)`,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "expense"),
          isNull(transactions.deletedAt),
          isNull(transactions.parentId),
          isNull(categories.systemKey),
          gte(transactions.date, from),
          lte(transactions.date, to),
        ),
      )
      .groupBy(categories.name)
      .orderBy(desc(sql`SUM(${transactions.amount}::numeric + ${transactions.fee}::numeric)`));

    const byCategory = byCat.map((r) => ({ name: r.name, total: Number(r.total) }));
    const totalExpense = byCategory.reduce((s, r) => s + r.total, 0);
    return { totalExpense, byCategory };
  };

  const [thisWeek, lastWeek] = await Promise.all([
    fetchWeek(thisStart, thisEnd),
    fetchWeek(lastStart, lastEnd),
  ]);
  return { thisWeek, lastWeek };
}

function deterministicSummary(stats: WeekStats): { title: string; body: string } {
  const wow = stats.thisWeek.totalExpense - stats.lastWeek.totalExpense;
  const pct =
    stats.lastWeek.totalExpense > 0
      ? (wow / stats.lastWeek.totalExpense) * 100
      : 0;
  const direction = wow >= 0 ? "up" : "down";
  const top = stats.thisWeek.byCategory.slice(0, 3);
  const topStr = top.length
    ? top
        .map((c) => `${c.name} ${Math.round(c.total).toLocaleString()}`)
        .join(", ")
    : "no expenses logged";
  return {
    title: `Weekly digest — ${Math.round(stats.thisWeek.totalExpense).toLocaleString()} spent`,
    body: `${direction} ${Math.abs(Math.round(pct))}% vs last week. Top: ${topStr}.`,
  };
}

export async function buildWeeklyDigest(
  userId: string,
  refDate: Date = new Date(),
): Promise<InsightDraft | null> {
  const stats = await loadWeekStats(userId, refDate);
  if (stats.thisWeek.totalExpense === 0 && stats.lastWeek.totalExpense === 0) {
    return null; // no activity to summarise
  }

  const fallback = deterministicSummary(stats);
  const dedupeKey = `digest:${format(refDate, "RRRR-II")}`; // ISO week

  const client = openai();
  if (!client) {
    return {
      kind: "weekly_digest",
      severity: "info",
      title: fallback.title,
      body: fallback.body,
      payload: { stats },
      dedupeKey,
    };
  }

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write one-paragraph weekly money summaries for a personal finance app user. " +
            'Respond with JSON: {"title": "<short headline ≤60 chars>", "body": "<2-3 sentences, conversational, factual, no emojis>"}. ' +
            "Compare this week to last week. Call out the category that moved the most. " +
            "Don't moralise — no 'be careful' or 'consider reducing'. Just describe what happened.",
        },
        {
          role: "user",
          content: JSON.stringify(stats),
        },
      ],
    });
    const content = resp.choices[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content) as { title?: string; body?: string };
      if (parsed.title && parsed.body) {
        return {
          kind: "weekly_digest",
          severity: "info",
          title: parsed.title.slice(0, 80),
          body: parsed.body.slice(0, 600),
          payload: { stats, source: "llm" },
          dedupeKey,
        };
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "weekly digest LLM call failed; using fallback");
  }

  return {
    kind: "weekly_digest",
    severity: "info",
    title: fallback.title,
    body: fallback.body,
    payload: { stats, source: "fallback" },
    dedupeKey,
  };
}
