export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/**
 * Parses RFC 4180 CSV text. Handles quoted fields, doubled quotes inside
 * quotes, embedded newlines, and both LF and CRLF line endings. The first
 * row is treated as the header row.
 */
export function parseCsv(text: string): ParsedCsv {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const input = text.startsWith("\ufeff") ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += char;
    }
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headers = [], ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows };
}

/**
 * Normalises common date formats to YYYY-MM-DD. Returns null when the value
 * cannot be read. Ambiguous numeric dates (01/02/2024) follow `dayFirst`.
 */
export function normaliseCsvDate(value: string, dayFirst = false): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return buildDate(iso[1], iso[2], iso[3]);

  const slash = trimmed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (slash) {
    const [, a, b, year] = slash;
    return dayFirst ? buildDate(year, b, a) : buildDate(year, a, b);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return buildDate(
    String(parsed.getFullYear()),
    String(parsed.getMonth() + 1),
    String(parsed.getDate())
  );
}

function buildDate(year: string, month: string, day: string): string | null {
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Strips currency symbols and thousands separators: "৳1,250.50" -> 1250.5 */
export function parseCsvAmount(value: string): number | null {
  const cleaned = value.replace(/[^0-9.\-()]/g, "");
  if (!cleaned) return null;
  const negative = cleaned.startsWith("(") && cleaned.endsWith(")");
  const num = Number(cleaned.replace(/[()]/g, ""));
  if (Number.isNaN(num)) return null;
  return negative ? -Math.abs(num) : num;
}
