"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchMerchants, ensureMerchant } from "@/lib/actions/merchants";

type Suggestion = {
  id: string;
  name: string;
  defaultCategoryId: string | null;
  defaultCategoryName: string | null;
  defaultCategoryIcon: string | null;
};

interface MerchantInputProps {
  value: string;
  merchantId: string | null;
  onChange: (args: { name: string; merchantId: string | null; defaultCategoryId: string | null }) => void;
  placeholder?: string;
}

/**
 * Merchant autocomplete:
 *   - Types name, sees matches against `merchants.normalized`.
 *   - Click a match → fills name + merchantId; if the merchant has a default
 *     category, the parent form may apply it.
 *   - Enter without a match → creates a new merchant on the next keystroke
 *     pause (debounced) OR on transaction submit, whichever comes first.
 */
export function MerchantInput({
  value,
  merchantId,
  onChange,
  placeholder = "Merchant",
}: MerchantInputProps) {
  const [text, setText] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim() || text === value) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await searchMerchants(text, 6);
        setSuggestions(rows as Suggestion[]);
        setOpen(rows.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, value]);

  const apply = (s: Suggestion) => {
    setText(s.name);
    setSuggestions([]);
    setOpen(false);
    onChange({ name: s.name, merchantId: s.id, defaultCategoryId: s.defaultCategoryId });
  };

  const commitFreeform = async () => {
    const name = text.trim();
    if (!name) {
      onChange({ name: "", merchantId: null, defaultCategoryId: null });
      return;
    }
    // If the user already picked a merchant whose name matches, keep its id.
    if (merchantId && name === value) return;
    try {
      const m = await ensureMerchant(name);
      onChange({ name: m.name, merchantId: m.id, defaultCategoryId: m.defaultCategoryId });
    } catch {
      onChange({ name, merchantId: null, defaultCategoryId: null });
    }
  };

  return (
    <div className="relative">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          // Defer to allow click-on-suggestion to land first.
          setTimeout(() => {
            setOpen(false);
            void commitFreeform();
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (suggestions[0]) apply(suggestions[0]);
            else void commitFreeform();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover p-1 shadow-md">
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(s)}
              className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="truncate">{s.name}</span>
              {s.defaultCategoryName && (
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {s.defaultCategoryIcon} {s.defaultCategoryName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
