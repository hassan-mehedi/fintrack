export interface SplitRow {
  categoryId: string;
  amount: string;
  note: string;
}

export const MAX_SPLIT_ROWS = 20;

// Matches the server-side tolerance for decimal(12,2) rounding
export const SPLIT_SUM_TOLERANCE = 0.005;

export function emptySplitRow(): SplitRow {
  return { categoryId: "", amount: "", note: "" };
}

export function sumSplitAmounts(splits: { amount: string | number }[]): number {
  return splits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
}

export function splitRemainder(total: number, splits: { amount: string | number }[]): number {
  return Math.round((total - sumSplitAmounts(splits)) * 100) / 100;
}

export function splitsMatchTotal(total: number, splits: { amount: string | number }[]): boolean {
  return Math.abs(total - sumSplitAmounts(splits)) <= SPLIT_SUM_TOLERANCE;
}

// Every row filled in and the parts adding up to the transaction amount
export function splitsReady(total: number, splits: SplitRow[]): boolean {
  return (
    splits.length > 0 &&
    splits.length <= MAX_SPLIT_ROWS &&
    splits.every((row) => row.categoryId !== "" && Number(row.amount) > 0) &&
    splitsMatchTotal(total, splits)
  );
}
