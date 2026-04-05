import { LIMITS } from "./rate-limit";

interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Unicode normalization — defeat homoglyph / encoding bypasses
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return (
    text
      // Unicode NFKC normalizes lookalike chars (е→e, ％→%, ＜→<, etc.)
      .normalize("NFKC")
      // Strip zero-width characters used to break pattern matching
      .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, "")
      // Collapse whitespace (tabs, non-breaking spaces, etc.)
      .replace(/\s+/g, " ")
      .trim()
  );
}

// ---------------------------------------------------------------------------
// Injection patterns — checked against normalized text
// ---------------------------------------------------------------------------

const INJECTION_PATTERNS: RegExp[] = [
  // Instruction override attempts
  /ignore\s+(all\s+)?(previous|prior|above|earlier|system)\s+(instructions?|prompts?|rules?|context)/i,
  /forget\s+(your|all|previous|prior)\s+(instructions?|rules?|prompts?|context)/i,
  /disregard\s+(your|all|the|previous)?\s*(instructions?|rules?|prompts?|guidelines?)/i,
  /override\s+(your|the|all)\s+(instructions?|rules?|prompts?|constraints?)/i,
  /do\s+not\s+follow\s+(your|the)\s+(instructions?|rules?)/i,
  /stop\s+being\s+(a|an|the)\s+(assistant|ai|bot)/i,

  // Role-play / identity hijacking
  /you\s+are\s+now\s+(a|an|the)\s+/i,
  /pretend\s+(to\s+be|you'?re|that\s+you)\s+/i,
  /act\s+as\s+(a|an|the|if)\s+/i,
  /roleplay\s+(as|like)/i,
  /from\s+now\s+on\s+(you|your)\s+(are|will|should)/i,
  /switch\s+(to|into)\s+(a\s+)?(new|different)\s+(mode|persona|role)/i,

  // System prompt extraction
  /show\s+(me\s+)?(your|the)\s+(system|initial|original)\s+(prompt|instructions?|message)/i,
  /what\s+(are|were)\s+your\s+(system\s+)?(instructions?|rules?|prompt)/i,
  /reveal\s+(your|the)\s+(system|hidden)\s+(prompt|instructions?)/i,
  /repeat\s+(your|the)\s+(system|initial|original)\s+(prompt|instructions?|message)/i,
  /output\s+(your|the)\s+(system|initial)\s+(prompt|instructions?)/i,

  // Prompt delimiters / injection markers
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /\[system\]/i,
  /\[inst\]/i,
  /<<\s*sys\s*>>/i,
  /\[INST\]/i,
  /### (system|instruction|human|assistant)/i,

  // Known jailbreak names
  /jailbreak/i,
  /DAN\s+mode/i,
  /\bDAN\b/,
  /developer\s+mode/i,
  /god\s+mode/i,
  /sudo\s+mode/i,
  /unrestricted\s+mode/i,

  // Encoding / obfuscation prompts
  /base64\s+(decode|encode|the\s+following)/i,
  /rot13/i,
  /decode\s+(this|the\s+following)\s+(hex|base64|binary)/i,
  /in\s+(hex|binary|base64)\s*:/i,

  // Harmful action requests
  /generate\s+(malware|exploit|virus|ransomware)/i,
  /write\s+(a\s+)?(script|code)\s+(to|that)\s+(hack|exploit|attack)/i,
];

// ---------------------------------------------------------------------------
// Suspicious structure heuristics
// ---------------------------------------------------------------------------

function hasSuspiciousStructure(text: string): boolean {
  // Excessive special characters (potential encoding bypass)
  const specialCharRatio =
    (text.replace(/[a-zA-Z0-9\s.,!?'"()-]/g, "").length) / Math.max(text.length, 1);
  if (specialCharRatio > 0.4) return true;

  // Repeated separator characters (often used to "break out" of context)
  if (/[-=]{10,}/.test(text)) return true;
  if (/[#]{5,}/.test(text)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const BLOCKED_RESPONSE =
  "This message was blocked. Please ask a question about your finances.";

export function validateMessage(text: string): ValidationResult {
  if (!text || typeof text !== "string") {
    return { valid: false, error: "Message is required." };
  }

  const normalized = normalize(text);

  if (normalized.length === 0) {
    return { valid: false, error: "Message cannot be empty." };
  }

  if (normalized.length > LIMITS.maxMessageLength) {
    return {
      valid: false,
      error: `Message is too long (${normalized.length}/${LIMITS.maxMessageLength} characters).`,
    };
  }

  // Check regex patterns against normalized text
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return { valid: false, error: BLOCKED_RESPONSE };
    }
  }

  // Structural heuristics
  if (hasSuspiciousStructure(normalized)) {
    return { valid: false, error: BLOCKED_RESPONSE };
  }

  return { valid: true };
}
