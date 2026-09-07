import { normaliseCsvDate, parseCsvAmount } from "@fintrack/shared/csv";
import type { ImportTransactionRow } from "@fintrack/shared/validators";

export const IMPORT_FIELDS = ["date", "amount", "description", "type", "category", "tags"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

// column index per field; undefined means the field is not mapped
export type ColumnMapping = Partial<Record<ImportField, number>>;

export const REQUIRED_FIELDS: ImportField[] = ["date", "amount"];

const HEADER_PATTERNS: Record<ImportField, RegExp> = {
  date: /^(txn[_ ]?|transaction[_ ]?|posting[_ ]?|value[_ ]?)?date$|^posted$/i,
  amount: /^amount|^amt$|^value$|^sum$/i,
  description: /^(description|memo|narration|details?|particulars|payee|merchant|note)s?$/i,
  type: /^(type|txn[_ ]?type|transaction[_ ]?type|dr\/?cr|debit\/credit|direction)$/i,
  category: /^categor(y|ies)$/i,
  tags: /^(tags?|labels?)$/i,
};

export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) {
    const index = headers.findIndex((h) => HEADER_PATTERNS[field].test(h.trim()));
    if (index !== -1) mapping[field] = index;
  }
  return mapping;
}

const EXPENSE_PATTERN = /^(expense|debit|out|withdrawal|dr\b|payment|spent)/i;
const INCOME_PATTERN = /^(income|credit|in\b|deposit|cr\b|received)/i;

export function parseCsvType(value: string | undefined): "income" | "expense" | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (EXPENSE_PATTERN.test(trimmed)) return "expense";
  if (INCOME_PATTERN.test(trimmed)) return "income";
  return null;
}

export function splitTags(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(/[;|]/).map((t) => t.trim()).filter(Boolean))];
}

export interface MapOptions {
  dayFirst: boolean;
}

export interface InvalidRow {
  index: number;
  reason: string;
}

export interface MappedRows {
  valid: ImportTransactionRow[];
  invalid: InvalidRow[];
  // one entry per source row, so the preview can show every line in order
  preview: Array<{ index: number; row: ImportTransactionRow | null; reason?: string }>;
}

function cell(row: string[], index: number | undefined) {
  return index === undefined ? undefined : row[index];
}

export function mapCsvRow(
  row: string[],
  mapping: ColumnMapping,
  options: MapOptions
): { row: ImportTransactionRow } | { reason: string } {
  const date = normaliseCsvDate(cell(row, mapping.date) ?? "", options.dayFirst);
  if (!date) return { reason: "Unreadable date" };

  const rawAmount = parseCsvAmount(cell(row, mapping.amount) ?? "");
  if (rawAmount === null || rawAmount === 0) return { reason: "Missing or zero amount" };

  let type: "income" | "expense" | null;
  if (mapping.type !== undefined) {
    type = parseCsvType(cell(row, mapping.type));
    if (!type) return { reason: "Unrecognised type" };
  } else {
    type = rawAmount < 0 ? "expense" : "income";
  }

  const categoryName = cell(row, mapping.category)?.trim() || null;
  const description = (cell(row, mapping.description) ?? "").trim().slice(0, 500);

  return {
    row: {
      date,
      amount: Math.abs(rawAmount).toFixed(2),
      type,
      description,
      categoryName: categoryName ? categoryName.slice(0, 80) : null,
      tags: splitTags(cell(row, mapping.tags)).map((t) => t.slice(0, 40)).slice(0, 20),
    },
  };
}

export function mapCsvRows(rows: string[][], mapping: ColumnMapping, options: MapOptions): MappedRows {
  const result: MappedRows = { valid: [], invalid: [], preview: [] };
  rows.forEach((source, index) => {
    const mapped = mapCsvRow(source, mapping, options);
    if ("row" in mapped) {
      result.valid.push(mapped.row);
      result.preview.push({ index, row: mapped.row });
    } else {
      result.invalid.push({ index, reason: mapped.reason });
      result.preview.push({ index, row: null, reason: mapped.reason });
    }
  });
  return result;
}
