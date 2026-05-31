"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { Category } from "@/lib/types";

export type SplitChildRow = {
  categoryId: string;
  amount: string;
  description?: string;
};

interface SplitsEditorProps {
  /** Total expected for the parent transaction. */
  totalAmount: number;
  categories: Category[];
  /** Filtered to those usable for the parent's type (income vs expense). */
  filteredCategories: Category[];
  value: SplitChildRow[];
  onChange: (rows: SplitChildRow[]) => void;
}

/**
 * Edits the children of a split. The parent supplies the total; this editor
 * shows the running sum and a "remaining" indicator so the user can balance
 * the rows. Validation that sum === total is enforced by the form's Zod
 * schema; this UI helps you get there.
 */
export function SplitsEditor({
  totalAmount,
  filteredCategories,
  value,
  onChange,
}: SplitsEditorProps) {
  const sum = useMemo(
    () => value.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [value],
  );
  const remaining = totalAmount - sum;
  const balanced = Math.abs(remaining) < 0.005;

  const add = () => {
    onChange([...value, { categoryId: "", amount: remaining > 0 ? remaining.toFixed(2) : "", description: "" }]);
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<SplitChildRow>) =>
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Splits</span>
        <span
          className={`text-xs ${
            balanced ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {balanced
            ? `Balanced (${sum.toFixed(2)} of ${totalAmount.toFixed(2)})`
            : `${remaining >= 0 ? "Remaining" : "Over by"} ${Math.abs(
                remaining,
              ).toFixed(2)}`}
        </span>
      </div>

      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add at least two child categories. Their amounts must sum to the
          parent transaction amount.
        </p>
      )}

      <div className="space-y-2">
        {value.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr,7rem,auto] gap-2">
            <Select
              value={row.categoryId}
              onValueChange={(v) => update(i, { categoryId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={row.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remove(i)}
              aria-label="Remove split"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Input
              className="col-span-3"
              placeholder="Optional note (e.g. Toothpaste)"
              value={row.description ?? ""}
              onChange={(e) => update(i, { description: e.target.value })}
            />
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add split
      </Button>
    </div>
  );
}
