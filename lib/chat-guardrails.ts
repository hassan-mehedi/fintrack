import { LIMITS } from "./rate-limit";

interface ValidationResult {
  valid: boolean;
  error?: string;
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /forget\s+(your|all|previous)\s+(instructions|rules|prompts)/i,
  /you\s+are\s+now\s+(a|an|the)\s+/i,
  /pretend\s+(to\s+be|you'?re)\s+/i,
  /act\s+as\s+(a|an|the)\s+/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /\[system\]/i,
  /do\s+not\s+follow\s+(your|the)\s+(instructions|rules)/i,
  /override\s+(your|the|all)\s+(instructions|rules|prompts)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
];

export function validateMessage(text: string): ValidationResult {
  if (!text || typeof text !== "string") {
    return { valid: false, error: "Message is required." };
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Message cannot be empty." };
  }

  if (trimmed.length > LIMITS.maxMessageLength) {
    return {
      valid: false,
      error: `Message is too long (${trimmed.length}/${LIMITS.maxMessageLength} characters).`,
    };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error:
          "This message was blocked. Please ask a question about your finances.",
      };
    }
  }

  return { valid: true };
}
