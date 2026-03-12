"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "./theme-toggle";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { getAccounts } from "@/lib/actions/accounts";
import { getCategories } from "@/lib/actions/categories";
import type { FinancialAccount, Category } from "@/lib/types";

export function Header() {
  const [formOpen, setFormOpen] = useState(false);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Fetch accounts/categories when the dialog opens
  useEffect(() => {
    if (formOpen) {
      Promise.all([getAccounts(), getCategories()]).then(([accts, cats]) => {
        setAccounts(accts as FinancialAccount[]);
        setCategories(cats as Category[]);
      });
    }
  }, [formOpen]);

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <div className="flex-1" />
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Transaction
        </Button>
        <ThemeToggle />
      </header>

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        accounts={accounts}
        categories={categories}
      />
    </>
  );
}
