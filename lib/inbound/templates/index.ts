import type { InboundTemplate, RawInbound, TemplateResult } from "../types";
import { bkashSmsTemplate } from "./bkash";
import { nagadSmsTemplate } from "./nagad";
import { rocketSmsTemplate } from "./rocket";
import { upaySmsTemplate } from "./upay";
import { cityBankTemplate } from "./citybank";
import { eblTemplate } from "./ebl";
import { genericCardAlertTemplate } from "./generic-card";

/**
 * Ordered list of templates. Specific provider templates run first; the
 * generic card-alert template is a catch-all and runs last.
 *
 * Confidence levels:
 *   provider-specific templates → 0.95
 *   generic card alert          → 0.70
 */
const SPECIFIC: InboundTemplate[] = [
  bkashSmsTemplate,
  nagadSmsTemplate,
  rocketSmsTemplate,
  upaySmsTemplate,
  cityBankTemplate,
  eblTemplate,
];

const FALLBACKS: InboundTemplate[] = [genericCardAlertTemplate];

/**
 * Walks templates in order, returning the first successful parse, or null
 * if every template either skipped or failed.
 */
export function runTemplates(raw: RawInbound): TemplateResult | null {
  for (const t of SPECIFIC) {
    if (!t.matches(raw)) continue;
    const parsed = t.parse(raw);
    if (parsed) return { templateId: t.id, parsed, confidence: 0.95 };
  }
  for (const t of FALLBACKS) {
    if (!t.matches(raw)) continue;
    const parsed = t.parse(raw);
    if (parsed) return { templateId: t.id, parsed, confidence: 0.7 };
  }
  return null;
}

export const TEMPLATE_IDS = [
  ...SPECIFIC.map((t) => t.id),
  ...FALLBACKS.map((t) => t.id),
];
