"use client";

import { createContext, useContext, useCallback } from "react";
import { type CurrencyCode, DEFAULT_CURRENCY } from "@/lib/currencies";
import { formatCurrency as formatCurrencyUtil } from "@/lib/utils";

const CurrencyContext = createContext<CurrencyCode>(DEFAULT_CURRENCY);

export function CurrencyProvider({
  currency,
  children,
}: {
  currency: CurrencyCode;
  children: React.ReactNode;
}) {
  return (
    <CurrencyContext.Provider value={currency}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyCode {
  return useContext(CurrencyContext);
}

export function useFormatCurrency() {
  const currency = useCurrency();
  return useCallback(
    (amount: number, rounded = false) => formatCurrencyUtil(amount, rounded, currency),
    [currency],
  );
}
