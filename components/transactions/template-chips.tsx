"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { listTemplates } from "@/lib/actions/templates";
import { templateToFormDefaults } from "@/lib/templates";
import type { TransactionTemplate } from "@/lib/types";

interface TemplateChipsProps {
  /** Called when a template is clicked. Receives form-shaped defaults the parent can pass to form.reset(). */
  onApply: (defaults: ReturnType<typeof templateToFormDefaults> & { templateName: string }) => void;
}

/**
 * Renders the user's saved templates as one-tap chips at the top of the
 * transaction form. Clicking pre-fills the form with the template's values.
 */
export function TemplateChips({ onApply }: TemplateChipsProps) {
  const [items, setItems] = useState<TransactionTemplate[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = (await listTemplates()) as TransactionTemplate[];
        setItems(rows);
      } catch {
        // ignore — templates are optional
      }
    })();
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-muted/40 p-2">
      <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="mr-1 text-xs text-muted-foreground">Templates:</span>
      {items.map((t) => (
        <Button
          key={t.id}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={() =>
            onApply({
              ...templateToFormDefaults(t),
              templateName: t.name,
            })
          }
          title={t.description || t.name}
        >
          {t.icon && <span>{t.icon}</span>}
          {t.name}
        </Button>
      ))}
    </div>
  );
}
