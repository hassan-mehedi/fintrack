import { z } from "zod";

export const templateSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  accountId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  amount: z
    .string()
    .nullable()
    .optional()
    .refine((v) => v == null || v === "" || !Number.isNaN(Number(v)), "Must be a number"),
  fee: z.string().default("0"),
  type: z.enum(["income", "expense", "transfer"]),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  icon: z.string().nullable().optional(),
});

export type TemplateInput = z.infer<typeof templateSchema>;

/**
 * Pure helper: turns a template row into a TransactionInput-shaped default
 * the transaction form can hydrate from.
 */
export function templateToFormDefaults(t: {
  accountId: string | null;
  categoryId: string | null;
  amount: string | null;
  fee: string;
  type: "income" | "expense" | "transfer";
  description: string;
  tags: string[];
}) {
  return {
    accountId: t.accountId ?? "",
    categoryId: t.categoryId ?? "",
    toAccountId: null as string | null,
    amount: t.amount ?? "",
    fee: t.fee || "0",
    type: t.type,
    description: t.description || "",
    tags: [...t.tags],
  };
}
