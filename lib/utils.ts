import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const currencyFormatterRounded = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCurrency(amount: number, rounded = false) {
  return rounded
    ? currencyFormatterRounded.format(amount)
    : currencyFormatter.format(amount);
}
