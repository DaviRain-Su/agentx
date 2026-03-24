/**
 * AgentSession — Durable Object using pi-worker's Agent pattern.
 *
 * Uses @mariozechner/pi-agent-core Agent + custom CF AI Gateway model,
 * with SQLite-backed file store (pi-worker SqliteTextFileStore interface).
 *
 * Model routing: CF AI Gateway → Workers AI (free default).
 * Change AI_GATEWAY_MODEL env var to use any gateway provider.
 */

import { Agent } from "@mariozechner/pi-agent-core";
import { AuthStorage, ModelRegistry } from "pi-coding-agent-worker";
import { Type } from "@sinclair/typebox";
import { Env } from "../index";

// ─── SqliteTextFileStore (pi-worker interface) ────────────────────────────────

export interface SqliteTextFileStore {
  get(path: string): Promise<string | undefined>;
  put(path: string, content: string): Promise<void>;
  list(): Promise<string[]>;
}

class DOFileStore implements SqliteTextFileStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path    TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated INTEGER NOT NULL
      );
    `);
  }

  async get(path: string): Promise<string | undefined> {
    const rows = [...this.sql.exec("SELECT content FROM files WHERE path = ?", path)];
    return rows.length > 0 ? (rows[0].content as string) : undefined;
  }

  async put(path: string, content: string): Promise<void> {
    this.sql.exec(
      "INSERT OR REPLACE INTO files (path, content, updated) VALUES (?, ?, ?)",
      path, content, Date.now()
    );
  }

  async list(): Promise<string[]> {
    return [...this.sql.exec("SELECT path FROM files ORDER BY path")].map(
      (r) => r.path as string
    );
  }
}

// ─── CF AI Gateway Model ──────────────────────────────────────────────────────
// Exact same pattern as pi-worker/examples/terminal-agent/src/tui-session.ts

function buildGatewayModel(env: Env) {
  const id = env.AI_GATEWAY_MODEL?.trim() || "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  return {
    provider: "ai-gateway",
    id,
    name: `AI Gateway (${id})`,
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    baseUrl: `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(env.CF_ACCOUNT_ID)}/${encodeURIComponent(env.CF_GATEWAY_NAME)}/compat`,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: "max_tokens" },
  } as any;
}

function createModelRegistry(env: Env) {
  const authStorage = AuthStorage.inMemory();
  if (env.CF_GATEWAY_TOKEN) {
    authStorage.setRuntimeApiKey("ai-gateway", env.CF_GATEWAY_TOKEN);
  }
  const modelRegistry = new ModelRegistry(authStorage);
  const model = buildGatewayModel(env);
  modelRegistry.registerProvider("ai-gateway", {
    baseUrl: model.baseUrl,
    apiKey: "CF_GATEWAY_TOKEN",
    authHeader: true,
    api: model.api,
    models: [{ id: model.id, name: model.name, reasoning: model.reasoning, input: model.input, cost: model.cost, contextWindow: model.contextWindow, maxTokens: model.maxTokens, compat: model.compat }],
  });
  return { authStorage, modelRegistry, model };
}

// ─── Tools (TypeBox format — pi-worker pattern) ───────────────────────────────

function buildTools(store: DOFileStore) {
  return [
    // ── fetch_price ──────────────────────────────────────────────────────────
    {
      name: "fetch_price" as const,
      label: "fetch_price",
      description: "Fetch the live USD price of a cryptocurrency from Binance.",
      parameters: Type.Object({
        token: Type.String({ description: "Token symbol e.g. ETH, BTC, SOL" }),
      }),
      execute: async (_id: string, { token }: { token: string }) => {
        const TICKERS: Record<string, string> = {
          ethereum: "ETH", bitcoin: "BTC", solana: "SOL",
          binancecoin: "BNB", avalanche: "AVAX",
        };
        const ticker = TICKERS[token.toLowerCase()] ?? token.toUpperCase();
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${ticker}USDT`);
        if (!res.ok) throw new Error(`Binance ${res.status} for ${ticker}USDT`);
        const data = await res.json() as { price: string };
        const text = `${ticker} = $${parseFloat(data.price).toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`;
        return { content: [{ type: "text" as const, text }], details: {} };
      },
    },

    // ── evaluate_condition ────────────────────────────────────────────────────
    {
      name: "evaluate_condition" as const,
      label: "evaluate_condition",
      description: "Check if a numeric value satisfies a condition (e.g. price > 3000).",
      parameters: Type.Object({
        value:     Type.Number({ description: "Value to check" }),
        operator:  Type.Union([Type.Literal("<"), Type.Literal(">"), Type.Literal("<="), Type.Literal(">="), Type.Literal("==")], { description: "Comparison operator" }),
        threshold: Type.Number({ description: "Threshold to compare against" }),
      }),
      execute: async (_id: string, { value, operator, threshold }: { value: number; operator: string; threshold: number }) => {
        const ops: Record<string, boolean> = {
          "<": value < threshold, ">": value > threshold,
          "<=": value <= threshold, ">=": value >= threshold, "==": value === threshold,
        };
        const result = ops[operator] ?? false;
        const text = `${value} ${operator} ${threshold} → **${result ? "TRUE ✓" : "FALSE ✗"}**`;
        return { content: [{ type: "text" as const, text }], details: {} };
      },
    },

    // ── prepare_trade ─────────────────────────────────────────────────────────
    {
      name: "prepare_trade" as const,
      label: "prepare_trade",
      description: "Prepare a DEX trade on X Layer. Requires human wallet signature before execution.",
      parameters: Type.Object({
        action: Type.Union([Type.Literal("buy"), Type.Literal("sell")], { description: "Trade direction" }),
        token:  Type.String({ description: "Token symbol e.g. ETH, BTC" }),
        amount: Type.String({ description: "Amount e.g. 0.1" }),
        price:  Type.Optional(Type.Number({ description: "Current price in USD" })),
      }),
      execute: async (_id: string, { action, token, amount, price }: { action: string; token: string; amount: string; price?: number }) => {
        const val = price ? (parseFloat(amount) * price).toFixed(2) : "?";
        const text = [
          `**Trade prepared** (awaiting human approval)`,
          `Action: ${action.toUpperCase()} ${amount} ${token}`,
          price ? `Est. value: $${val} USD` : "",
          `⚠️ Requires wallet signature before execution.`,
        ].filter(Boolean).join("\n");
        return { content: [{ type: "text" as const, text }], details: {} };
      },
    },

    // ── write_note ────────────────────────────────────────────────────────────
    {
      name: "write_note" as const,
      label: "write_note",
      description: "Save a note to the session workspace (SQLite-backed, persisted across messages).",
      parameters: Type.Object({
        filename: Type.String({ description: "Filename e.g. analysis.md" }),
        content:  Type.String({ description: "Content to save" }),
      }),
      execute: async (_id: string, { filename, content }: { filename: string; content: string }) => {
        await store.put(filename, content);
        return { content: [{ type: "text" as const, text: `Saved ${filename} (${content.length} chars)` }], details: {} };
      },
    },

    // ── read_note ─────────────────────────────────────────────────────────────
    {
      name: "read_note" as const,
      label: "read_note",
      description: "Read a previously saved note from the session workspace.",
      parameters: Type.Object({
        filename: Type.String({ description: "Filename to read" }),
      }),
      execute: async (_id: string, { filename }: { filename: string }) => {
        const text = await store.get(filename);
        if (!text) throw new Error(`File not found: ${filename}`);
        return { content: [{ type: "text" as const, text }], details: {} };
      },
    },

    // ── list_notes ────────────────────────────────────────────────────────────
    {
      name: "list_notes" as const,
      label: "list_notes",
      description: "List all saved files in the session workspace.",
      parameters: Type.Object({}),
      execute: async (_id: string, _args: Record<string, never>) => {
        const files = await store.list();
        const text = files.length > 0 ? files.join("\n") : "(empty workspace)";
        return { content: [{ type: "text" as const, text }], details: {} };
      },
    },
  ];
}

// ─── AgentSession Durable Object ─────────────────────────────────────────────

export class AgentSession {
  private readonly sql: SqlStorage;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        role    TEXT NOT NULL,
        content TEXT NOT NULL,
        ts      INTEGER NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      const { message } = (await request.json()) as { message: string };
      const reply = await this.chat(message);
      return cors(Response.json({ response: reply }));
    }

    if (url.pathname === "/history" && request.method === "GET") {
      return cors(Response.json({ history: this.loadHistory() }));
    }

    if (url.pathname === "/clear" && request.method === "POST") {
      this.sql.exec("DELETE FROM history");
      return cors(Response.json({ ok: true }));
    }

    if (url.pathname === "/info" && request.method === "GET") {
      return cors(Response.json({
        model: this.env.AI_GATEWAY_MODEL || "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        gateway: `${this.env.CF_ACCOUNT_ID}/${this.env.CF_GATEWAY_NAME}`,
        messages: this.loadHistory().length,
      }));
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    let data: { type: string; content?: string };
    try { data = JSON.parse(message); }
    catch { ws.send(JSON.stringify({ type: "error", content: "Invalid JSON" })); return; }

    if (data.type === "message" && data.content) {
      ws.send(JSON.stringify({ type: "start" }));
      try {
        const reply = await this.chat(data.content);
        ws.send(JSON.stringify({ type: "delta", content: reply }));
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", content: err instanceof Error ? err.message : String(err) }));
      } finally {
        ws.send(JSON.stringify({ type: "end" }));
      }
    } else if (data.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    } else if (data.type === "clear") {
      this.sql.exec("DELETE FROM history");
      ws.send(JSON.stringify({ type: "cleared" }));
    }
  }

  async webSocketClose(): Promise<void> {}
  async webSocketError(_ws: WebSocket, err: unknown): Promise<void> {
    console.error("[AgentSession] WS error:", err);
  }

  // ─── Core chat using pi-worker's Agent ────────────────────────────────────

  private async chat(userMessage: string): Promise<string> {
    const store = new DOFileStore(this.sql);
    this.saveMsg("user", userMessage);

    // Build conversation history for Agent
    const history = this.loadHistory().slice(-20);
    const priorMessages = history.slice(0, -1).map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));

    const { modelRegistry, model } = createModelRegistry(this.env);
    const tools = buildTools(store);

    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: "off",
        tools,
        messages: priorMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: [{ type: "text" as const, text: m.content }],
          id: crypto.randomUUID(),
          ts: Date.now(),
        })) as any,
      },
      modelRegistry,
    } as any);

    await agent.prompt(userMessage);

    // Extract last assistant reply (pi-worker pattern from hello-agent)
    const assistantMsgs = (agent.state.messages as any[]).filter((m) => m.role === "assistant");
    const last = assistantMsgs[assistantMsgs.length - 1] as any;
    const content = last?.content;
    const reply = Array.isArray(content)
      ? content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("")
      : (typeof content === "string" ? content : "Done.");

    this.saveMsg("assistant", reply);
    return reply;
  }

  private loadHistory(): Array<{ role: string; content: string; ts: number }> {
    return [...this.sql.exec("SELECT role, content, ts FROM history ORDER BY id")].map(
      (r) => ({ role: r.role as string, content: r.content as string, ts: r.ts as number })
    );
  }

  private saveMsg(role: string, content: string): void {
    this.sql.exec(
      "INSERT INTO history (role, content, ts) VALUES (?, ?, ?)",
      role, content, Date.now()
    );
  }
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Gradience Agent — an autonomous AI in a decentralized agent network built on X Layer blockchain.

You have tools:
- fetch_price: live crypto prices from Binance
- evaluate_condition: check if price meets a threshold
- prepare_trade: prepare a DEX trade (requires human approval to execute)
- write_note / read_note / list_notes: persistent SQLite-backed workspace

Use tools autonomously. Be concise and technically precise.`;

// ─── CORS ─────────────────────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function cors(r: Response): Response {
  const h = new Headers(r.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => h.set(k, v));
  return new Response(r.body, { status: r.status, headers: h });
}
