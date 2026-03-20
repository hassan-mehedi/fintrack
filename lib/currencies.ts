export const SUPPORTED_CURRENCIES = [
  { code: "BDT", name: "Bangladeshi Taka", symbol: "\u09F3", locale: "en-BD" },
  { code: "USD", name: "US Dollar", symbol: "$", locale: "en-US" },
  { code: "EUR", name: "Euro", symbol: "\u20AC", locale: "de-DE" },
  { code: "GBP", name: "British Pound", symbol: "\u00A3", locale: "en-GB" },
  { code: "INR", name: "Indian Rupee", symbol: "\u20B9", locale: "en-IN" },
  { code: "JPY", name: "Japanese Yen", symbol: "\u00A5", locale: "ja-JP" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$", locale: "en-CA" },
  { code: "AUD", name: "Australian Dollar", symbol: "$", locale: "en-AU" },
  { code: "CNY", name: "Chinese Yuan", symbol: "\u00A5", locale: "zh-CN" },
  { code: "SAR", name: "Saudi Riyal", symbol: "\uFDFC", locale: "ar-SA" },
  { code: "AED", name: "UAE Dirham", symbol: "\u062F.\u0625", locale: "ar-AE" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", locale: "ms-MY" },
  { code: "SGD", name: "Singapore Dollar", symbol: "$", locale: "en-SG" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "\u20A8", locale: "en-PK" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", locale: "pt-BR" },
  { code: "TRY", name: "Turkish Lira", symbol: "\u20BA", locale: "tr-TR" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: CurrencyCode = "BDT";

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as [
  CurrencyCode,
  ...CurrencyCode[],
];

export function getCurrencyInfo(code: string) {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) ?? SUPPORTED_CURRENCIES[0];
}
