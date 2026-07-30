import { createOpenAI } from "@ai-sdk/openai";

export type AIProviderName = "openai" | "deepseek";

export interface AIProviderConfig {
  provider: AIProviderName;
  apiKey: string;
  baseURL: string;
  model: string;
}

interface ProviderDefaults {
  baseURL: string;
  model: string;
  apiKeyEnv: string;
}

const PROVIDER_DEFAULTS: Record<AIProviderName, ProviderDefaults> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
};

export function resolveAIConfig(
  env: Record<string, string | undefined>
): AIProviderConfig {
  const provider = (env.AI_PROVIDER ??
    (env.DEEPSEEK_API_KEY ? "deepseek" : "openai")) as AIProviderName;

  const defaults = PROVIDER_DEFAULTS[provider];
  if (!defaults) {
    throw new Error(
      `Unsupported AI_PROVIDER "${provider}". Use "openai" or "deepseek".`
    );
  }

  const apiKey = env.AI_API_KEY ?? env[defaults.apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `Missing AI API key. Set ${defaults.apiKeyEnv} (or AI_API_KEY) in your environment.`
    );
  }

  return {
    provider,
    apiKey,
    baseURL: env.AI_BASE_URL ?? defaults.baseURL,
    model: env.AI_MODEL ?? defaults.model,
  };
}

export function getAIConfig(): AIProviderConfig {
  return resolveAIConfig(process.env);
}

export function getChatModel() {
  const config = getAIConfig();
  const client = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  return client.chat(config.model);
}

export function isVoiceInputAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
