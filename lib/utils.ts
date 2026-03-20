import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { type CurrencyCode, DEFAULT_CURRENCY, getCurrencyInfo } from "./currencies"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: CurrencyCode, rounded: boolean): Intl.NumberFormat {
  const key = `${currency}-${rounded}`;
  let fmt = formatterCache.get(key);
  if (!fmt) {
    const info = getCurrencyInfo(currency);
    fmt = new Intl.NumberFormat(info.locale, {
      style: "currency",
      currency: info.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: rounded ? 0 : 2,
    });
    formatterCache.set(key, fmt);
  }
  return fmt;
}

export function formatCurrency(
  amount: number,
  rounded = false,
  currency: CurrencyCode = DEFAULT_CURRENCY,
) {
  return getFormatter(currency, rounded).format(amount);
}
