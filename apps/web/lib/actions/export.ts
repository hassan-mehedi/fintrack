"use server";

import * as exporter from "@fintrack/core/export";
import type { ExportFilters } from "@fintrack/core/export";
import { requireUserId } from "@/lib/action-session";

export async function exportTransactionsCSV(filters?: ExportFilters) {
    const userId = await requireUserId();
    return exporter.exportTransactionsCSV(userId, filters);
}
