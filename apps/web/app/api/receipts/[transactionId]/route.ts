import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@fintrack/core/errors";
import {
  attachReceipt,
  getReceiptUrl,
  removeReceipt,
  RECEIPT_MAX_BYTES,
} from "@fintrack/core/receipts";
import { isStorageConfigured } from "@fintrack/core/storage";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ transactionId: string }> };

const transactionIdSchema = z.string().uuid();

async function resolveRequest(context: RouteContext) {
  if (!isStorageConfigured()) {
    return { error: Response.json({ error: "Receipt storage is not configured" }, { status: 503 }) };
  }
  const session = await auth();
  if (!session?.user?.id) {
    return { error: new Response("Unauthorized", { status: 401 }) };
  }
  const { transactionId } = await context.params;
  if (!transactionIdSchema.safeParse(transactionId).success) {
    return { error: Response.json({ error: "Transaction not found" }, { status: 404 }) };
  }
  return { userId: session.user.id, transactionId };
}

function errorResponse(error: unknown, path: string) {
  if (error instanceof NotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  logger.error({ path, err: error }, "receipt request failed");
  return Response.json({ error: "Internal server error" }, { status: 500 });
}

export async function POST(req: Request, context: RouteContext) {
  const resolved = await resolveRequest(context);
  if ("error" in resolved) return resolved.error;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing receipt file" }, { status: 400 });
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return Response.json({ error: "Receipts must be 5 MB or smaller" }, { status: 400 });
  }

  try {
    const result = await attachReceipt(resolved.userId, resolved.transactionId, {
      name: file.name,
      mime: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidatePath("/transactions");
    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "/api/receipts");
  }
}

export async function GET(_req: Request, context: RouteContext) {
  const resolved = await resolveRequest(context);
  if ("error" in resolved) return resolved.error;

  try {
    const { url } = await getReceiptUrl(resolved.userId, resolved.transactionId);
    return Response.redirect(url, 302);
  } catch (error) {
    return errorResponse(error, "/api/receipts");
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const resolved = await resolveRequest(context);
  if ("error" in resolved) return resolved.error;

  try {
    await removeReceipt(resolved.userId, resolved.transactionId);
    revalidatePath("/transactions");
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error, "/api/receipts");
  }
}
