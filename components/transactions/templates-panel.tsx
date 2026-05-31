"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/lib/actions/templates";
import { getAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import type {
  TransactionTemplate,
  FinancialAccount,
  Category,
} from "@/lib/types";

type Draft = {
  id?: string;
  name: string;
  accountId: string | null;
  categoryId: string | null;
  amount: string;
  type: "income" | "expense" | "transfer";
  description: string;
  icon: string;
};

function emptyDraft(): Draft {
  return {
    name: "",
    accountId: null,
    categoryId: null,
    amount: "",
    type: "expense",
    description: "",
    icon: "",
  };
}

export function TemplatesPanel() {
  const [items, setItems] = useState<TransactionTemplate[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [t, a, c] = await Promise.all([
        listTemplates(),
        getAccounts(),
        getCategories(),
      ]);
      setItems(t as TransactionTemplate[]);
      setAccounts(a as FinancialAccount[]);
      setCategories(c as Category[]);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startNew = () => setDraft(emptyDraft());
  const startEdit = (t: TransactionTemplate) =>
    setDraft({
      id: t.id,
      name: t.name,
      accountId: t.accountId,
      categoryId: t.categoryId,
      amount: t.amount ?? "",
      type: t.type as "income" | "expense" | "transfer",
      description: t.description ?? "",
      icon: t.icon ?? "",
    });

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const payload = {
        name: draft.name.trim(),
        accountId: draft.accountId,
        categoryId: draft.categoryId,
        amount: draft.amount,
        fee: "0",
        type: draft.type,
        description: draft.description,
        tags: [],
        icon: draft.icon || null,
      };
      if (draft.id) await updateTemplate(draft.id, payload);
      else await createTemplate(payload);
      setDraft(null);
      await refresh();
      toast.success("Template saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    setBusy(true);
    try {
      await deleteTemplate(id);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const filteredCategories = draft
    ? categories.filter(
        (c) => c.type === draft.type || c.type === "both",
      )
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick-add templates</CardTitle>
        <CardDescription>
          One-tap presets shown above the transaction form. Great for recurring
          things you log manually — coffee, lunch, taxi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && !draft && (
          <p className="text-sm text-muted-foreground">No templates yet.</p>
        )}

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-md border p-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {t.icon && <span>{t.icon}</span>}
                    <span className="truncate">{t.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      ({t.type})
                    </span>
                  </div>
                  {(t.amount || t.description) && (
                    <div className="text-xs text-muted-foreground">
                      {t.amount && <span>{t.amount} · </span>}
                      <span className="truncate">{t.description}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(t)}
                    disabled={busy}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(t.id)}
                    disabled={busy}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {draft && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[7rem,1fr]">
              <Input
                placeholder="Icon"
                value={draft.icon}
                onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                maxLength={4}
              />
              <Input
                placeholder="Name (e.g. Lunch)"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Select
                value={draft.type}
                onValueChange={(v) =>
                  setDraft({
                    ...draft,
                    type: v as "income" | "expense" | "transfer",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={draft.accountId ?? ""}
                onValueChange={(v) =>
                  setDraft({ ...draft, accountId: v || null })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Account (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={draft.categoryId ?? ""}
                onValueChange={(v) =>
                  setDraft({ ...draft, categoryId: v || null })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Default amount (optional)"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            />
            <Input
              placeholder="Description (optional)"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(null)}
                disabled={busy}
              >
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={busy || !draft.name.trim()}
              >
                <Check className="mr-1 h-4 w-4" /> Save
              </Button>
            </div>
          </div>
        )}

        {!draft && (
          <Button variant="outline" onClick={startNew}>
            <Plus className="mr-1 h-4 w-4" /> Add template
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
