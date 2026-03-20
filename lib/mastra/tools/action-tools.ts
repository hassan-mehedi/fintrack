import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  transactions,
  financialAccounts,
  categories,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getBalanceDelta, getTransferDeltas } from "@/lib/accounts";

async function getAccountType(accountId: string): Promise<string> {
  const [account] = await db
    .select({ type: financialAccounts.type })
    .from(financialAccounts)
    .where(eq(financialAccounts.id, accountId))
    .limit(1);
  return account.type;
}

export const getCategoriesList = createTool({
  id: "get-categories-list",
  description:
    "Get all categories with their IDs, names, icons, and types. Use this to look up category IDs when the user mentions a category by name before creating a transaction.",
  inputSchema: z.object({
    type: z
      .enum(["income", "expense", "both"])
      .optional()
      .describe("Filter categories by type"),
  }),
  outputSchema: z.object({
    categories: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        icon: z.string(),
        type: z.string(),
      })
    ),
  }),
  execute: async (inputData, context) => {
    const userId = context?.requestContext?.get("userId") as string;

    const allCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId));

    const filtered = inputData.type
      ? allCategories.filter(
          (cat) => cat.type === inputData.type || cat.type === "both"
        )
      : allCategories;

    return {
      categories: filtered.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        type: c.type,
      })),
    };
  },
});

export const createAccountTool = createTool({
  id: "create-account",
  description:
    "Create a new financial account for the user. Use this when the user wants to add a bank account, mobile banking account, cash wallet, credit card, or loan. Always confirm the details with the user before calling this tool.",
  inputSchema: z.object({
    name: z.string().describe("Account name, e.g. 'Dutch Bangla Bank'"),
    type: z
      .enum(["bank", "mobile_banking", "cash", "credit_card", "loan", "custom"])
      .describe("Account type"),
    balance: z
      .string()
      .describe("Initial balance (for assets) or current amount owed (for liabilities) as a decimal string, e.g. '1000.00'"),
    icon: z.string().describe("Emoji icon, e.g. '🏦'"),
    color: z.string().describe("Hex color, e.g. '#10b981'"),
    defaultFeeRate: z
      .string()
      .optional()
      .describe(
        "Default transaction fee rate as percentage string, e.g. '1.85'"
      ),
    creditLimit: z
      .string()
      .optional()
      .describe("Credit limit for credit cards or loans, e.g. '50000.00'"),
    isDefault: z.boolean().describe("Whether this is the default account"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    account: z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      balance: z.number(),
    }),
  }),
  execute: async (inputData, context) => {
    const userId = context?.requestContext?.get("userId") as string;

    const [account] = await db
      .insert(financialAccounts)
      .values({
        userId,
        name: inputData.name,
        type: inputData.type,
        balance: inputData.balance,
        icon: inputData.icon,
        color: inputData.color,
        defaultFeeRate: inputData.defaultFeeRate || null,
        creditLimit: inputData.creditLimit || null,
        isDefault: inputData.isDefault,
      })
      .returning();

    return {
      success: true,
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        balance: Number(account.balance),
      },
    };
  },
});

export const createTransactionTool = createTool({
  id: "create-transaction",
  description:
    "Create a new transaction (income, expense, or transfer). Before calling this, ALWAYS use getAccountsList and getCategoriesList to resolve account and category names to UUIDs. Always confirm the details with the user before calling this tool.",
  inputSchema: z.object({
    accountId: z.string().uuid().describe("UUID of the source account"),
    categoryId: z.string().uuid().describe("UUID of the category"),
    amount: z
      .string()
      .describe("Transaction amount as decimal string, e.g. '50.00'"),
    fee: z
      .string()
      .optional()
      .describe("Transaction fee as decimal string. Defaults to '0'"),
    type: z
      .enum(["income", "expense", "transfer"])
      .describe("Transaction type"),
    description: z
      .string()
      .optional()
      .describe("Description of the transaction"),
    date: z
      .string()
      .optional()
      .describe("Date in YYYY-MM-DD format. Defaults to today if not provided."),
    tags: z
      .array(z.string())
      .describe("1-3 relevant lowercase tags for the transaction, e.g. ['grocery', 'weekly']"),
    toAccountId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "UUID of destination account, required for transfer type"
      ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    transaction: z.object({
      id: z.string(),
      amount: z.number(),
      type: z.string(),
      description: z.string(),
      date: z.string(),
    }),
    message: z.string(),
  }),
  execute: async (inputData, context) => {
    const userId = context?.requestContext?.get("userId") as string;
    const amount = Number(inputData.amount);
    const fee = Number(inputData.fee || 0);
    const date = inputData.date || new Date().toISOString().split("T")[0];

    if (inputData.type === "transfer" && !inputData.toAccountId) {
      return {
        success: false,
        transaction: { id: "", amount: 0, type: "", description: "", date: "" },
        message: "Transfer transactions require a destination account (toAccountId).",
      };
    }

    const [txn] = await db
      .insert(transactions)
      .values({
        userId,
        accountId: inputData.accountId,
        toAccountId: inputData.toAccountId || null,
        categoryId: inputData.categoryId,
        amount: inputData.amount,
        fee: inputData.fee || "0",
        type: inputData.type,
        description: inputData.description || "",
        date,
        tags: inputData.tags || [],
      })
      .returning();

    const sourceType = await getAccountType(inputData.accountId);

    if (inputData.type === "income" || inputData.type === "expense") {
      const delta = getBalanceDelta(sourceType, inputData.type, amount, fee);
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${delta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, inputData.accountId));
    } else if (inputData.type === "transfer" && inputData.toAccountId) {
      const destType = await getAccountType(inputData.toAccountId);
      const { sourceDelta, destDelta } = getTransferDeltas(
        sourceType, destType, amount, fee
      );

      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${sourceDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, inputData.accountId));
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${destDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, inputData.toAccountId));
    }

    return {
      success: true,
      transaction: {
        id: txn.id,
        amount: Number(txn.amount),
        type: txn.type,
        description: txn.description,
        date: txn.date,
      },
      message: `Successfully created ${inputData.type} transaction of ${amount.toFixed(2)}.`,
    };
  },
});

export const updateTransactionTool = createTool({
  id: "update-transaction",
  description:
    "Update an existing transaction. Before calling this, use getTransactionsList to find the transaction ID. Always confirm the changes with the user before calling this tool.",
  inputSchema: z.object({
    transactionId: z
      .string()
      .uuid()
      .describe("UUID of the transaction to update"),
    accountId: z.string().uuid().describe("UUID of the account"),
    categoryId: z.string().uuid().describe("UUID of the category"),
    amount: z
      .string()
      .describe("Updated amount as decimal string, e.g. '60.00'"),
    fee: z
      .string()
      .optional()
      .describe("Updated fee as decimal string. Defaults to '0'"),
    type: z
      .enum(["income", "expense", "transfer"])
      .describe("Transaction type"),
    description: z
      .string()
      .optional()
      .describe("Updated description"),
    date: z.string().describe("Updated date in YYYY-MM-DD format"),
    tags: z.array(z.string()).optional().describe("Updated tags"),
    toAccountId: z
      .string()
      .uuid()
      .optional()
      .describe("UUID of destination account for transfers"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    transaction: z.object({
      id: z.string(),
      amount: z.number(),
      type: z.string(),
      description: z.string(),
      date: z.string(),
    }),
    message: z.string(),
  }),
  execute: async (inputData, context) => {
    const userId = context?.requestContext?.get("userId") as string;

    const [oldTxn] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, inputData.transactionId),
          eq(transactions.userId, userId)
        )
      )
      .limit(1);

    if (!oldTxn) {
      return {
        success: false,
        transaction: { id: "", amount: 0, type: "", description: "", date: "" },
        message: "Transaction not found.",
      };
    }

    const oldAmount = Number(oldTxn.amount);
    const oldFee = Number(oldTxn.fee);
    const newAmount = Number(inputData.amount);
    const newFee = Number(inputData.fee || 0);

    // 1. Reverse old balance effects
    const oldSourceType = await getAccountType(oldTxn.accountId);

    if (oldTxn.type === "income" || oldTxn.type === "expense") {
      const oldDelta = getBalanceDelta(oldSourceType, oldTxn.type, oldAmount, oldFee);
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric - ${oldDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, oldTxn.accountId));
    } else if (oldTxn.type === "transfer" && oldTxn.toAccountId) {
      const oldDestType = await getAccountType(oldTxn.toAccountId);
      const { sourceDelta, destDelta } = getTransferDeltas(
        oldSourceType, oldDestType, oldAmount, oldFee
      );
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric - ${sourceDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, oldTxn.accountId));
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric - ${destDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, oldTxn.toAccountId));
    }

    // 2. Update the transaction record
    const [updated] = await db
      .update(transactions)
      .set({
        accountId: inputData.accountId,
        toAccountId: inputData.toAccountId || null,
        categoryId: inputData.categoryId,
        amount: inputData.amount,
        fee: inputData.fee || "0",
        type: inputData.type,
        description: inputData.description || "",
        date: inputData.date,
        tags: inputData.tags || [],
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(transactions.id, inputData.transactionId),
          eq(transactions.userId, userId)
        )
      )
      .returning();

    // 3. Apply new balance effects
    const newSourceType = await getAccountType(inputData.accountId);

    if (inputData.type === "income" || inputData.type === "expense") {
      const newDelta = getBalanceDelta(newSourceType, inputData.type, newAmount, newFee);
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${newDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, inputData.accountId));
    } else if (inputData.type === "transfer" && inputData.toAccountId) {
      const newDestType = await getAccountType(inputData.toAccountId);
      const { sourceDelta, destDelta } = getTransferDeltas(
        newSourceType, newDestType, newAmount, newFee
      );
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${sourceDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, inputData.accountId));
      await db
        .update(financialAccounts)
        .set({
          balance: sql`${financialAccounts.balance}::numeric + ${destDelta}`,
          updatedAt: new Date(),
        })
        .where(eq(financialAccounts.id, inputData.toAccountId));
    }

    return {
      success: true,
      transaction: {
        id: updated.id,
        amount: Number(updated.amount),
        type: updated.type,
        description: updated.description,
        date: updated.date,
      },
      message: `Successfully updated transaction to ${newAmount.toFixed(2)}.`,
    };
  },
});
