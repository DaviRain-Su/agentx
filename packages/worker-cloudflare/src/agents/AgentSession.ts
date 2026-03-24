/**
 * AgentSession - Durable Object powered by pi-agent-core
 *
 * Uses @mariozechner/pi-agent-core's Agent class (real multi-turn tool calling loop)
 * with SQLite-backed file storage following the pi-worker SqliteTextFileStore pattern.
 *
 * Reference: https://github.com/qaml-ai/pi-worker
 *
 * Access is gated: caller must prove ownership of an active Gradience task
 * before this DO is reachable (enforced in the main Worker).
 */

import { Agent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { Env } from "../index";

// ─── SqliteTextFileStore ──────────────────────────────────────────────────────
// Implements the pi-worker SqliteTextFileStore interface backed by DO's SQLite.
// See: https://github.com/qaml-ai/pi-worker/blob/main/packages/pi-worker/src/sqlite-tools.ts

class DOFileStore {
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
      path,
      content,
      Date.now()
    );
  }

  async list(): Promise<string[]> {
    const rows = [...this.sql.exec("SELECT path FROM files ORDER BY path")];
    return rows.map((r) => r.path as string);
  }
}

// ─── File Tools (pi-worker SqliteTextFileStore pattern) ───────────────────────
// Same tool interface as pi-worker's createSqliteTools():
//   { name, label, description, parameters (TypeBox), execute }
// Reference: github.com/qaml-ai/pi-worker/packages/pi-worker/src/sqlite-tools.ts

function createFileTools(store: DOFileStore) {
  const readTool = {
    name: "read" as const,
    label: "Read File",
    description: "Read a file from the agent's workspace. Output is line-limited; use offset/limit for large files.",
    parameters: Type.Object({
      path: Type.String({ description: "File path to read" }),
      offset: Type.Optional(Type.Number({ description: "Start line (1-indexed)" })),
      limit: Type.Optional(Type.Number({ description: "Max lines to return (default 500)" })),
    }),
    execute: async (
      _id: string,
      { path, offset, limit }: { path: string; offset?: number; limit?: number }
    ) => {
      const content = await store.get(sanitizePath(path));
      if (content === undefined) throw new Error(`File not found: ${path}`);

      const lines = content.split("\n");
      const total = lines.length;
      const start = offset ? Math.max(0, offset - 1) : 0;
      if (start >= total) throw new Error(`Offset ${offset} beyond file end (${total} lines)`);
      const end = Math.min(start + (limit ?? 500), total);
      let out = lines.slice(start, end).join("\n");
      if (end < total) out += `\n\n[Lines ${start + 1}-${end} of ${total}. Use offset=${end + 1} for more.]`;

      return { content: [{ type: "text" as const, text: out }], details: {} };
    },
  };

  const writeTool = {
    name: "write" as const,
    label: "Write File",
    description: "Write content to a file in the agent's workspace. Creates or overwrites.",
    parameters: Type.Object({
      path: Type.String({ description: "File path to write" }),
      content: Type.String({ description: "Content to write" }),
    }),
    execute: async (_id: string, { path, content }: { path: string; content: string }) => {
      await store.put(sanitizePath(path), content);
      return {
        content: [{ type: "text" as const, text: `Wrote ${content.length} bytes to ${path}` }],
        details: {},
      };
    },
  };

  const lsTool = {
    name: "ls" as const,
    label: "List Files",
    description: "List files in the agent's workspace.",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Directory to list (default: root)" })),
    }),
    execute: async (_id: string, { path }: { path?: string }) => {
      const all = await store.list();
      const prefix = path ? sanitizePath(path).replace(/\/?$/, "/") : "";
      const entries = new Set<string>();
      for (const key of all) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        if (!rest) continue;
        const slash = rest.indexOf("/");
        entries.add(slash === -1 ? rest : rest.slice(0, slash + 1));
      }
      const sorted = [...entries].sort();
      const text = sorted.length > 0 ? sorted.join("\n") : "(empty)";
      return { content: [{ type: "text" as const, text }], details: {} };
    },
  };

  return [readTool, writeTool, lsTool];
}

function sanitizePath(p: string): string {
  return p.replace(/^\/+/, "").replace(/\.\./g, "").replace(/\/\/+/g, "/");
}

// ─── Gradience Domain Tools ────────────────────────────────────────────────────
// These extend the agent's capabilities with real blockchain/DeFi data.

function createPriceTool() {
  return {
    name: "fetch_price" as const,
    label: "Fetch Token Price",
    description:
      "Fetch the live USD price of a cryptocurrency from Binance. Returns the current market price.",
    parameters: Type.Object({
      token: Type.String({
        description:
          "Token symbol or CoinGecko ID (e.g. 'ethereum', 'bitcoin', 'solana', 'ETH', 'BTC')",
      }),
    }),
    execute: async (_id: string, { token }: { token: string }) => {
      const TICKER_MAP: Record<string, string> = {
        ethereum: "ETH",
        bitcoin: "BTC",
        solana: "SOL",
        binancecoin: "BNB",
        "matic-network": "MATIC",
        avalanche: "AVAX",
        polkadot: "DOT",
        chainlink: "LINK",
      };
      const ticker = TICKER_MAP[token.toLowerCase()] ?? token.toUpperCase();
      const symbol = `${ticker}USDT`;
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
      if (!res.ok) throw new Error(`Binance error ${res.status} for ${symbol}`);
      const data = (await res.json()) as { price: string };
      const price = parseFloat(data.price);
      return {
        content: [
          {
            type: "text" as const,
            text: `${ticker} = $${price.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD (Binance, live)`,
          },
        ],
        details: { token: ticker, price, source: "binance", timestamp: Date.now() },
      };
    },
  };
}

function createConditionTool() {
  return {
    name: "evaluate_condition" as const,
    label: "Evaluate Condition",
    description: "Evaluate whether a numeric value satisfies a condition (e.g. price > 3000).",
    parameters: Type.Object({
      value: Type.Number({ description: "The numeric value to check" }),
      operator: Type.Union(
        [
          Type.Literal("<"),
          Type.Literal(">"),
          Type.Literal("<="),
          Type.Literal(">="),
          Type.Literal("=="),
        ],
        { description: "Comparison operator" }
      ),
      threshold: Type.Number({ description: "The threshold to compare against" }),
    }),
    execute: async (
      _id: string,
      { value, operator, threshold }: { value: number; operator: string; threshold: number }
    ) => {
      const ops: Record<string, (a: number, b: number) => boolean> = {
        "<": (a, b) => a < b,
        ">": (a, b) => a > b,
        "<=": (a, b) => a <= b,
        ">=": (a, b) => a >= b,
        "==": (a, b) => a === b,
      };
      const fn = ops[operator];
      if (!fn) throw new Error(`Unknown operator: ${operator}`);
      const result = fn(value, threshold);
      return {
        content: [
          {
            type: "text" as const,
            text: `${value} ${operator} ${threshold} → **${result ? "TRUE ✓" : "FALSE ✗"}**`,
          },
        ],
        details: { value, operator, threshold, result },
      };
    },
  };
}

function createPrepareTradeTool() {
  return {
    name: "prepare_trade" as const,
    label: "Prepare Trade",
    description:
      "Prepare DEX trade parameters for a token swap on X Layer. Always requires human approval before signing.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("buy"), Type.Literal("sell")], {
        description: "Trade direction",
      }),
      token: Type.String({ description: "Token symbol (e.g. 'ETH', 'BTC')" }),
      amount: Type.String({ description: "Amount to trade (e.g. '0.1')" }),
      price: Type.Optional(Type.Number({ description: "Current price in USD" })),
    }),
    execute: async (
      _id: string,
      {
        action,
        token,
        amount,
        price,
      }: { action: string; token: string; amount: string; price?: number }
    ) => {
      const estimatedValue = price ? parseFloat(amount) * price : 0;
      const text = [
        `**Trade prepared** (awaiting human approval)`,
        `Action: ${action.toUpperCase()} ${amount} ${token}`,
        price ? `Est. value: $${estimatedValue.toFixed(2)} USD` : "",
        `⚠️ This requires your wallet signature before execution.`,
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [{ type: "text" as const, text }],
        details: {
          executed: false,
          requiresSignature: true,
          action,
          token,
          amount,
          estimatedPrice: price ?? 0,
          estimatedValue,
        },
      };
    },
  };
}

// ─── Message Persistence ──────────────────────────────────────────────────────

function serializeMessages(messages: AgentMessage[]): string {
  return JSON.stringify(messages);
}

function deserializeMessages(raw: string): AgentMessage[] {
  try {
    return JSON.parse(raw) as AgentMessage[];
  } catch {
    return [];
  }
}

// ─── AgentSession Durable Object ─────────────────────────────────────────────

export class AgentSession {
  private readonly sql: SqlStorage;
  private agent: Agent | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {
    this.sql = state.storage.sql;
    // Initialize tables
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // Lazily create (or restore) the Agent
  private getAgent(): Agent {
    if (this.agent) return this.agent;

    const fileStore = new DOFileStore(this.sql);

    const tools = [
      ...createFileTools(fileStore),
      createPriceTool(),
      createConditionTool(),
      createPrepareTradeTool(),
    ];

    this.agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: getModel("anthropic", "anthropic/claude-haiku-4.5"),
        tools,
        messages: this.loadMessages(),
      },
      getApiKey: async (provider: string) => {
        if (provider === "anthropic") return this.env.ANTHROPIC_API_KEY ?? "";
        return "";
      },
    });

    return this.agent;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // HTTP chat (fallback)
    if (url.pathname === "/chat" && request.method === "POST") {
      const { message } = (await request.json()) as { message: string };
      const reply = await this.runAgent(message);
      return cors(Response.json({ response: reply }));
    }

    // History
    if (url.pathname === "/history" && request.method === "GET") {
      const messages = this.loadMessages();
      const simplified = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          timestamp: (m as any).timestamp ?? 0,
        }));
      return cors(Response.json({ history: simplified }));
    }

    // Clear
    if (url.pathname === "/clear" && request.method === "POST") {
      this.sql.exec("DELETE FROM messages");
      this.agent?.clearMessages();
      return cors(Response.json({ ok: true }));
    }

    // Info
    if (url.pathname === "/info" && request.method === "GET") {
      const taskId = this.getMeta("taskId");
      const address = this.getMeta("address");
      return cors(Response.json({ taskId, address, messageCount: this.loadMessages().length }));
    }

    return new Response("Not found", { status: 404 });
  }

  // ─── WebSocket Handlers ─────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

    let data: { type: string; content?: string };
    try {
      data = JSON.parse(message);
    } catch {
      ws.send(JSON.stringify({ type: "error", content: "Invalid JSON" }));
      return;
    }

    switch (data.type) {
      case "message":
        if (data.content) await this.streamAgentToWebSocket(ws, data.content);
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "clear":
        this.sql.exec("DELETE FROM messages");
        this.agent?.clearMessages();
        ws.send(JSON.stringify({ type: "cleared" }));
        break;
    }
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {}
  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.error("[AgentSession] WS error:", error);
  }

  // ─── Agent Execution ────────────────────────────────────────────────────

  /** HTTP path: run the agent and return the final text */
  private async runAgent(userMessage: string): Promise<string> {
    const agent = this.getAgent();
    let finalText = "";

    const unsub = agent.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        finalText += event.assistantMessageEvent.delta;
      }
    });

    await agent.prompt(userMessage);
    unsub();

    // Persist updated messages
    this.saveMessages(agent.state.messages);
    return finalText || "Done.";
  }

  /** WebSocket path: stream agent events to the client */
  private async streamAgentToWebSocket(ws: WebSocket, userMessage: string): Promise<void> {
    const agent = this.getAgent();
    ws.send(JSON.stringify({ type: "start" }));

    const unsub = agent.subscribe((event) => {
      switch (event.type) {
        case "message_update":
          if (event.assistantMessageEvent.type === "text_delta") {
            ws.send(
              JSON.stringify({ type: "delta", content: event.assistantMessageEvent.delta })
            );
          }
          break;

        case "tool_execution_start":
          ws.send(
            JSON.stringify({
              type: "tool_start",
              name: (event as any).toolName ?? (event as any).toolCall?.name,
            })
          );
          break;

        case "tool_execution_end":
          ws.send(JSON.stringify({ type: "tool_end" }));
          break;

        case "agent_end":
          // Save updated conversation to SQLite
          this.saveMessages(agent.state.messages);
          ws.send(JSON.stringify({ type: "end" }));
          break;
      }
    });

    try {
      await agent.prompt(userMessage);
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "error",
          content: err instanceof Error ? err.message : String(err),
        })
      );
      ws.send(JSON.stringify({ type: "end" }));
    } finally {
      unsub();
    }
  }

  // ─── Message Persistence ────────────────────────────────────────────────

  private loadMessages(): AgentMessage[] {
    const rows = [...this.sql.exec("SELECT data FROM messages WHERE id = 1")];
    if (rows.length === 0) return [];
    return deserializeMessages(rows[0].data as string);
  }

  private saveMessages(messages: AgentMessage[]): void {
    const data = serializeMessages(messages);
    this.sql.exec(
      "INSERT OR REPLACE INTO messages (id, data) VALUES (1, ?)",
      data
    );
  }

  // ─── Session Metadata ───────────────────────────────────────────────────

  getMeta(key: string): string | null {
    const rows = [...this.sql.exec("SELECT value FROM session_meta WHERE key = ?", key)];
    return rows.length > 0 ? (rows[0].value as string) : null;
  }

  setMeta(key: string, value: string): void {
    this.sql.exec(
      "INSERT OR REPLACE INTO session_meta (key, value) VALUES (?, ?)",
      key,
      value
    );
  }
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Gradience Agent — an autonomous AI operating within a decentralized agent orchestration network on X Layer blockchain.

You have access to these tools:
- **fetch_price**: Get live cryptocurrency prices from Binance
- **evaluate_condition**: Check if a value meets a condition (e.g., price > threshold)
- **prepare_trade**: Prepare a DEX trade for user approval
- **read / write / ls**: Persistent file workspace — save research, calculations, plans

You can autonomously call multiple tools in sequence to complete tasks. For example:
1. Fetch ETH price
2. Evaluate if it meets a buy condition
3. If yes, prepare the trade

Always be transparent about what tools you're calling and why. For trade preparation, always note that human signature is required. Be concise and technically precise.`;

// ─── CORS Helpers ─────────────────────────────────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, headers });
}
