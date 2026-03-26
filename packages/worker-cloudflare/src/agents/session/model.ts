import type { Model } from "@mariozechner/pi-ai";
import type { Env } from "../../index";
import { DEFAULT_GATEWAY_MODEL } from "./constants";

export function buildGatewayModel(env: Env, preferred?: { provider: string; id: string }): Model<"openai-completions"> {
  const rawId = preferred?.id?.trim()
    || env.AI_GATEWAY_MODEL?.trim()
    || DEFAULT_GATEWAY_MODEL;
  const id = rawId === "auto" ? DEFAULT_GATEWAY_MODEL : rawId;

  // Use Workers AI endpoint directly (no gateway config needed)
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/ai/v1`;

  return {
    provider: "ai-gateway",
    id,
    name: `Workers AI (${id})`,
    api: "openai-completions",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 64000,
    baseUrl,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
  };
}
