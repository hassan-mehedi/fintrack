/**
 * Inbound parsing pipeline.
 *
 * Flow:
 *   1. Dedupe by (userId, source, externalId) if a refId is later parsed —
 *      we still write the row but mark it as a duplicate at apply time. Dedupe
 *      at the persistence boundary, not here.
 *   2. Run BD template registry; on first hit, store and stop.
 *   3. On miss, fall back to LLM extraction.
 *   4. Always persist the inbound_messages row. Status:
 *        parsed       — template hit; user reviews + accepts
 *        needs_review — LLM hit with confidence < 0.8
 *        failed       — neither template nor LLM produced output
 */

import { db } from "@/lib/db";
import { inboundMessages } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { runTemplates } from "./templates";
import { extractWithLLM } from "./llm-extract";
import type { RawInbound } from "./types";
import { logger } from "@/lib/logger";
import { onInboundIngested } from "@/lib/notifications/events";

export type IngestArgs = {
  userId: string;
  raw: RawInbound;
};

export type IngestResult = {
  id: string;
  status: "parsed" | "needs_review" | "failed";
  templateId: string | null;
  refId: string | null;
  confidence: number | null;
};

export async function ingestInbound({ userId, raw }: IngestArgs): Promise<IngestResult> {
  let templateResult = runTemplates(raw);
  if (!templateResult) {
    templateResult = await extractWithLLM(raw);
  }

  if (!templateResult) {
    const [row] = await db
      .insert(inboundMessages)
      .values({
        userId,
        source: raw.source,
        status: "failed",
        fromAddress: raw.fromAddress,
        subject: raw.subject,
        rawBody: raw.body.slice(0, 50_000),
        rawBytes: Buffer.byteLength(raw.body, "utf8"),
        receivedAt: raw.receivedAt,
        errorMessage: "No template or LLM extractor produced output",
      })
      .returning({ id: inboundMessages.id });
    return { id: row.id, status: "failed", templateId: null, refId: null, confidence: null };
  }

  const status =
    templateResult.confidence >= 0.8 ? "parsed" : "needs_review";

  try {
    const [row] = await db
      .insert(inboundMessages)
      .values({
        userId,
        source: raw.source,
        status,
        fromAddress: raw.fromAddress,
        subject: raw.subject,
        rawBody: raw.body.slice(0, 50_000),
        rawBytes: Buffer.byteLength(raw.body, "utf8"),
        receivedAt: raw.receivedAt,
        parsed: templateResult.parsed as unknown as Record<string, unknown>,
        templateId: templateResult.templateId,
        confidence: templateResult.confidence.toFixed(3),
        externalId: templateResult.parsed.refId,
      })
      .returning({ id: inboundMessages.id });

    // Fire-and-forget notification — failures are logged inside dispatch.
    onInboundIngested({
      userId,
      status,
      templateId: templateResult.templateId,
      parsed: templateResult.parsed,
      inboundMessageId: row.id,
    }).catch((err) => logger.warn({ err }, "inbound notification dispatch failed"));

    return {
      id: row.id,
      status,
      templateId: templateResult.templateId,
      refId: templateResult.parsed.refId,
      confidence: templateResult.confidence,
    };
  } catch (err) {
    // Most likely cause: unique violation on (userId, externalId) — i.e. the
    // same message was forwarded twice. Look up the existing row.
    const refId = templateResult.parsed.refId;
    if (refId) {
      const [existing] = await db
        .select({
          id: inboundMessages.id,
          status: inboundMessages.status,
          templateId: inboundMessages.templateId,
          confidence: inboundMessages.confidence,
        })
        .from(inboundMessages)
        .where(and(eq(inboundMessages.userId, userId), eq(inboundMessages.externalId, refId)))
        .limit(1);
      if (existing) {
        logger.info({ userId, refId }, "inbound message already exists (duplicate forward)");
        return {
          id: existing.id,
          status: existing.status as "parsed" | "needs_review" | "failed",
          templateId: existing.templateId,
          refId,
          confidence: existing.confidence ? Number(existing.confidence) : null,
        };
      }
    }
    throw err;
  }
}
