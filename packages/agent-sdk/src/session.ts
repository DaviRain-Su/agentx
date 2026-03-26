/**
 * createAgentXSession — Launch a pi-worker agent with AgentX payment tools.
 *
 * This is the main integration point between pi-worker and the AgentX
 * decentralized agent economy. It:
 *
 * 1. Takes a pi-worker SqliteTextFileStore (from your Durable Object SQLite)
 * 2. Creates file tools via pi-worker's createSqliteTools()
 * 3. Creates AgentX payment/market/task tools
 * 4. Passes everything to pi-coding-agent-worker's createAgentSession()
 *
 * Usage in a Cloudflare Durable Object:
 * ```typescript
 * import { DurableObject } from "cloudflare:workers";
 * import { getSqliteStore } from "pi-worker";
 * import { createAgentXSession } from "@agentx/agent-sdk";
 *
 * export class MyAgent extends DurableObject {
 *   async chat(userMessage: string): Promise<string> {
 *     const { session } = await createAgentXSession({
 *       sqliteStore: getSqliteStore(this.ctx.storage.sql),
 *       masterKey: this.env.NODE_PRIVATE_KEY,
 *       agentName: "my-agent",
 *       rpcUrl: this.env.XLAYER_RPC_URL,
 *       cfGatewayToken: this.env.CF_GATEWAY_TOKEN,
 *       cfAccountId: this.env.CF_ACCOUNT_ID,
 *       cfGatewayName: this.env.CF_GATEWAY_NAME,
 *     });
 *     return await session.run(userMessage);
 *   }
 * }
 * ```
 */

import { createAgentXTools, AGENTX_SYSTEM_PROMPT, type AgentXToolConfig } from "./tools/index.js";

export interface AgentXSessionConfig extends AgentXToolConfig {
  /** pi-worker SqliteTextFileStore — from getSqliteStore(this.ctx.storage.sql) */
  sqliteStore: {
    get(path: string): Promise<string | undefined>;
    put(path: string, content: string): Promise<void>;
    list(): Promise<string[]>;
  };
  /** Cloudflare AI Gateway token */
  cfGatewayToken: string;
  /** Cloudflare account ID */
  cfAccountId: string;
  /** Cloudflare AI gateway name */
  cfGatewayName: string;
  /** AI model ID (default: "dynamic/pi") */
  modelId?: string;
  /** Additional tools to include beyond file + payment tools */
  extraTools?: unknown[];
  /** Override the system prompt */
  systemPrompt?: string;
}

/**
 * Create a pi-worker agent session pre-loaded with AgentX payment tools.
 *
 * Combines:
 * - pi-worker's createSqliteTools() for persistent file system
 * - AgentX's createAgentXTools() for on-chain payments
 * - pi-coding-agent-worker's createAgentSession() for the agent loop
 */
export async function createAgentXSession(config: AgentXSessionConfig) {
  // Dynamic imports so pi-worker/pi-coding-agent-worker are optional peer deps.
  // If not installed, this throws a clear error.
  let createSqliteTools: (store: unknown) => unknown[];
  let createAgentSession: (opts: unknown) => Promise<{ session: unknown }>;
  let AuthStorage: { inMemory: () => unknown };
  let ModelRegistry: new (auth: unknown) => unknown;
  let SessionManager: { inMemory: () => unknown };
  let SettingsManager: { inMemory: (opts: unknown) => unknown };

  try {
    const piWorker = await import("pi-worker" as string);
    createSqliteTools = piWorker.createSqliteTools;
  } catch {
    throw new Error(
      "@agentx/agent-sdk: createAgentXSession() requires 'pi-worker' to be installed.\n" +
      "Run: npm install pi-worker"
    );
  }

  try {
    const piAgent = await import("pi-coding-agent-worker" as string);
    createAgentSession = piAgent.createAgentSession;
    AuthStorage = piAgent.AuthStorage;
    ModelRegistry = piAgent.ModelRegistry;
    SessionManager = piAgent.SessionManager;
    SettingsManager = piAgent.SettingsManager;
  } catch {
    throw new Error(
      "@agentx/agent-sdk: createAgentXSession() requires 'pi-coding-agent-worker' to be installed.\n" +
      "Run: npm install pi-coding-agent-worker"
    );
  }

  // ── File tools from pi-worker ─────────────────────────────────────────────
  const fileTools = createSqliteTools(config.sqliteStore);

  // ── Payment/market/task tools from AgentX SDK ──────────────────────────
  const paymentTools = createAgentXTools({
    masterKey: config.masterKey,
    agentName: config.agentName,
    rpcUrl: config.rpcUrl,
    contracts: config.contracts,
  });

  // ── All custom tools ──────────────────────────────────────────────────────
  const customTools = [
    ...fileTools,
    ...paymentTools,
    ...(config.extraTools ?? []),
  ];

  // ── Auth + model setup (same as pi-worker's tui-session) ──────────────────
  const authStorage = (AuthStorage as any).inMemory();
  (authStorage as any).setRuntimeApiKey("ai-gateway", config.cfGatewayToken);

  const modelRegistry = new (ModelRegistry as any)(authStorage);
  const modelId = config.modelId ?? "dynamic/pi";
  (modelRegistry as any).registerProvider("ai-gateway", {
    baseUrl: `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(config.cfAccountId)}/${encodeURIComponent(config.cfGatewayName)}/compat`,
    apiKey: "CF_GATEWAY_TOKEN",
    authHeader: true,
    api: "openai-completions",
    models: [{
      id: modelId,
      name: `AgentX (${modelId})`,
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 64000,
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: "max_tokens" },
    }],
  });

  const model = {
    provider: "ai-gateway", id: modelId, name: `AgentX (${modelId})`,
    api: "openai-completions", reasoning: true, input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000, maxTokens: 64000,
    baseUrl: `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(config.cfAccountId)}/${encodeURIComponent(config.cfGatewayName)}/compat`,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: "max_tokens" },
  };

  const sessionManager = (SessionManager as any).inMemory();
  const settingsManager = (SettingsManager as any).inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });

  // ── Minimal resource loader with AgentX system prompt ──────────────────
  const systemPrompt = config.systemPrompt ?? AGENTX_SYSTEM_PROMPT;
  const resourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createMinimalRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getAppendSystemPrompt: () => [],
    getPathMetadata: () => new Map(),
    extendResources: () => {},
    reload: async () => {},
  };

  // ── Create the session ────────────────────────────────────────────────────
  return createAgentSession({
    cwd: "/",
    agentDir: "/.pi/agent",
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: "medium",
    customTools,
    resourceLoader,
    sessionManager,
    settingsManager,
  } as unknown);
}

function createMinimalRuntime() {
  const noop = () => { throw new Error("runtime not initialized"); };
  return {
    sendMessage: noop, sendUserMessage: noop, appendEntry: noop,
    setSessionName: noop, getSessionName: noop, setLabel: noop,
    getActiveTools: noop, getAllTools: noop, setActiveTools: noop,
    refreshTools: () => {}, getCommands: noop,
    setModel: () => Promise.reject(new Error("not initialized")),
    getThinkingLevel: noop, setThinkingLevel: noop,
    flagValues: new Map(), pendingProviderRegistrations: [],
    registerProvider: (name: string, config: unknown) => {
      (createMinimalRuntime as any)._pending ??= [];
      (createMinimalRuntime as any)._pending.push({ name, config });
    },
    unregisterProvider: () => {},
  };
}
