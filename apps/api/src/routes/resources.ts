import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as accounts from "@fintrack/core/accounts";
import * as budgets from "@fintrack/core/budgets";
import * as categories from "@fintrack/core/categories";
import * as dashboard from "@fintrack/core/dashboard";
import * as exporter from "@fintrack/core/export";
import { getNetWorthHistory } from "@fintrack/core/net-worth";
import * as recurring from "@fintrack/core/recurring";
import { processRecurringForUser } from "@fintrack/core/recurring-processor";
import * as settings from "@fintrack/core/settings";
import * as subscription from "@fintrack/core/subscription";
import * as transactions from "@fintrack/core/transactions";

const idParams = z.object({ id: z.string().uuid() });

const transactionFilters = z.object({
    type: z.enum(["income", "expense", "transfer"]).optional(),
    categoryId: z.string().uuid().optional(),
    accountId: z.string().uuid().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

const netWorthHistoryQuery = z.object({
    months: z.coerce.number().int().min(1).max(24).optional(),
});

const budgetQuery = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
});

const dashboardQuery = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
});

const categoryQuery = z.object({
    type: z.enum(["income", "expense", "both"]).optional(),
});

const currencyBody = z.object({ currency: z.string().min(3).max(3) });

const toggleBody = z.object({ isActive: z.boolean() });

export async function resourceRoutes(app: FastifyInstance) {
    app.addHook("preHandler", app.authenticate);

    const userId = (request: { user: { id: string } | null }) => request.user!.id;

    app.get("/accounts", async (req) => accounts.getAccounts(userId(req)));
    app.post("/accounts", async (req, reply) => {
        const account = await accounts.createAccount(userId(req), req.body);
        return reply.code(201).send(account);
    });
    app.put("/accounts/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        return accounts.updateAccount(userId(req), id, req.body);
    });
    app.delete("/accounts/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        await accounts.deleteAccount(userId(req), id);
        return { success: true };
    });

    app.get("/categories", async (req) => {
        const { type } = categoryQuery.parse(req.query);
        return categories.getCategories(userId(req), type);
    });
    app.post("/categories", async (req, reply) => {
        const category = await categories.createCategory(userId(req), req.body);
        return reply.code(201).send(category);
    });
    app.put("/categories/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        return categories.updateCategory(userId(req), id, req.body);
    });
    app.delete("/categories/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        await categories.deleteCategory(userId(req), id);
        return { success: true };
    });

    app.get("/transactions", async (req) =>
        transactions.getTransactions(userId(req), transactionFilters.parse(req.query))
    );
    app.post("/transactions", async (req, reply) => {
        const created = await transactions.createTransaction(userId(req), req.body);
        return reply.code(201).send(created);
    });
    app.put("/transactions/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        return transactions.updateTransaction(userId(req), id, req.body);
    });
    app.delete("/transactions/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        await transactions.deleteTransaction(userId(req), id);
        return { success: true };
    });
    app.get("/transactions/export", async (req, reply) => {
        const csv = await exporter.exportTransactionsCSV(
            userId(req),
            transactionFilters.parse(req.query)
        );
        return reply
            .header("content-type", "text/csv; charset=utf-8")
            .header("content-disposition", "attachment; filename=transactions.csv")
            .send(csv);
    });

    app.get("/budgets", async (req) => {
        const { month, year } = budgetQuery.parse(req.query);
        return budgets.getBudgets(userId(req), month, year);
    });
    app.post("/budgets", async (req, reply) => {
        const budget = await budgets.createBudget(userId(req), req.body);
        return reply.code(201).send(budget);
    });
    app.delete("/budgets/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        await budgets.deleteBudget(userId(req), id);
        return { success: true };
    });

    app.get("/recurring", async (req) =>
        recurring.getRecurringTransactions(userId(req))
    );
    app.post("/recurring", async (req, reply) => {
        const created = await recurring.createRecurringTransaction(userId(req), req.body);
        return reply.code(201).send(created);
    });
    app.put("/recurring/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        await recurring.updateRecurringTransaction(userId(req), id, req.body);
        return { success: true };
    });
    app.delete("/recurring/:id", async (req) => {
        const { id } = idParams.parse(req.params);
        await recurring.deleteRecurringTransaction(userId(req), id);
        return { success: true };
    });
    app.post("/recurring/:id/toggle", async (req) => {
        const { id } = idParams.parse(req.params);
        const { isActive } = toggleBody.parse(req.body);
        await recurring.toggleRecurringTransaction(userId(req), id, isActive);
        return { success: true };
    });
    app.post("/recurring/process", async (req) =>
        processRecurringForUser(userId(req))
    );

    app.get("/dashboard", async (req) =>
        dashboard.getDashboardData(userId(req), dashboardQuery.parse(req.query))
    );

    app.get("/net-worth-history", async (req) => {
        const { months } = netWorthHistoryQuery.parse(req.query);
        return getNetWorthHistory(userId(req), months);
    });

    app.put("/settings/currency", async (req) => {
        const { currency } = currencyBody.parse(req.body);
        await settings.updateCurrency(userId(req), currency);
        return { success: true };
    });

    app.get("/subscription", async (req) =>
        subscription.getSubscriptionRequest(userId(req))
    );
    app.post("/subscription/interest", async (req, reply) => {
        const request = await subscription.submitInterestRequest(userId(req));
        return reply.code(201).send(request);
    });
}
