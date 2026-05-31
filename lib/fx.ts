import { db } from "@/lib/db";
import { fxRates } from "@/lib/db/schema";
import { and, eq, lte, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
const STALE_RATE_FALLBACK_DAYS = 14;

type Frankfurter = {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
};

/**
 * Returns the FX rate to convert 1 unit of `base` into `quote` on the given
 * date. Falls back to the most recent cached rate within 14 days if the live
 * fetch fails (weekends, holidays, network issues).
 */
export async function getRate(date: string, base: string, quote: string): Promise<number> {
  if (base === quote) return 1;

  const [cached] = await db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.date, date), eq(fxRates.base, base), eq(fxRates.quote, quote)))
    .limit(1);
  if (cached) return Number(cached.rate);

  try {
    const url = `${FRANKFURTER_BASE}/${encodeURIComponent(date)}?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const json = (await res.json()) as Frankfurter;
    const rate = json.rates[quote];
    if (!rate || !Number.isFinite(rate)) throw new Error(`no rate for ${quote}`);

    await db
      .insert(fxRates)
      .values({ date, base, quote, rate: String(rate), source: "frankfurter" })
      .onConflictDoNothing();
    return rate;
  } catch (err) {
    logger.warn({ err, date, base, quote }, "fx fetch failed; trying stale fallback");
    const [stale] = await db
      .select({ rate: fxRates.rate, date: fxRates.date })
      .from(fxRates)
      .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote), lte(fxRates.date, date)))
      .orderBy(desc(fxRates.date))
      .limit(1);
    if (stale) {
      const ageDays =
        (Date.parse(date) - Date.parse(stale.date)) / (1000 * 60 * 60 * 24);
      if (ageDays <= STALE_RATE_FALLBACK_DAYS) return Number(stale.rate);
    }
    throw new Error(
      `FX rate unavailable for ${base}→${quote} on ${date} and no recent fallback`,
    );
  }
}

export async function convertAmount(
  amount: number,
  date: string,
  from: string,
  to: string,
): Promise<{ value: number; rate: number }> {
  const rate = await getRate(date, from, to);
  return { value: amount * rate, rate };
}
