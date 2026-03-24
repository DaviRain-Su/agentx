/**
 * AgentSession - Durable Object with SQLite persistence
 *
 * LLM calls routed through Cloudflare AI Gateway:
 *   https://gateway.ai.cloudflare.com/v1/{CF_ACCOUNT_ID}/{CF_GATEWAY_NAME}/workers-ai/v1
 *
 * Default model: Workers AI (free). Configurable via AI_GATEWAY_MODEL env var.
 * Other providers (Anthropic, OpenAI, Groq, DeepSeek, ...) work by changing the
 * gateway path and provider API key — see CF AI Gateway docs.
 *
 * Access is gated: caller must own an active on-chain Gradience task.
 */

import { Env } from "../index";

// ─── SqliteTextFileStore (pi-worker pattern) ──────────────────────────────────
// https://github.com/qaml-ai/pi-worker/blob/main/packages/pi-worker/src/sqlite-tools.ts

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
      path, content, Date.now()
    );
  }

  async list(): Promise<string[]> {
    return [...this.sql.exec("SELECT path FROM files ORDER BY path")].map(
      (r) => r.path as string
    );
  }
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────
// Format follows pi-worker's tool interface.

interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

const TOOLS: Tool[] = [
  {
    name: "fetch_price",
    description: "Fetch the live USD price of a cryptocurrency from Binance.",
    input_schema: {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "Token symbol or CoinGecko ID (e.g. 'ethereum', 'ETH', 'BTC', 'solana')",
        },
      },
      required: ["token"],
    },
  },
  {
    name: "evaluate_condition",
    description: "Check if a numeric value satisfies a condition (e.g. price > 3000).",
    input_schema: {
      type: "object",
      properties: {
        value: { type: "number", description: "The value to check" },
        operator: {
          type: "string",
          enum: ["<", ">", "<=", ">=", "=="],
          description: "Comparison operator",
        },
        threshold: { type: "number", description: "Threshold to compare against" },
      },
      required: ["value", "operator", "threshold"],
    },
  },
  {
    name: "prepare_trade",
    description:
      "Prepare DEX trade parameters on X Layer. Always requires human wallet signature before execution.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["buy", "sell"], description: "Trade direction" },
        token: { type: "string", description: "Token symbol e.g. ETH, BTC" },
        amount: { type: "string", description: "Amount e.g. '0.1'" },
        price: { type: "number", description: "Current price in USD (optional)" },
      },
      required: ["action", "token", "amount"],
    },
  },
  {
    name: "write_note",
    description: "Save a note or calculation to the session workspace (persisted in SQLite).",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename e.g. 'analysis.md'" },
        content: { type: "string", description: "Content to save" },
      },
      required: ["filename", "content"],
    },
  },
  {
    name: "read_note",
    description: "Read a previously saved note from the session workspace.",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string", description: "Filename to read" },
      },
      required: ["filename"],
    },
  },
  {
    name: "list_notes",
    description: "List all saved files in the session workspace.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  store: DOFileStore
): Promise<string> {
  switch (name) {
    case "fetch_price": {
      const TICKERS: Record<string, string> = {
        ethereum: "ETH", bitcoin: "BTC", solana: "SOL",
        binancecoin: "BNB", "matic-network": "MATIC",
        avalanche: "AVAX", polkadot: "DOT", chainlink: "LINK",
      };
      const input = String(args.token ?? "");
      const ticker = TICKERS[input.toLowerCase()] ?? input.toUpperCase();
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${ticker}USDT`
      );
      if (!res.ok) throw new Error(`Binance ${res.status} for ${ticker}USDT`);
      const data = (await res.json()) as { price: string };
      const price = parseFloat(data.price);
      return `${ticker} = $${price.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD (Binance, live)`;
    }

    case "evaluate_condition": {
      const v = Number(args.value), t = Number(args.threshold), op = String(args.operator);
      const ops: Record<string, boolean> = {
        "<": v < t, ">": v > t, "<=": v <= t, ">=": v >= t, "==": v === t,
      };
      const result = ops[op] ?? false;
      return `${v} ${op} ${t} → **${result ? "TRUE ✓" : "FALSE ✗"}**`;
    }

    case "prepare_trade": {
      const { action, token, amount, price } = args as {
        action: string; token: string; amount: string; price?: number;
      };
      const val = price ? (parseFloat(amount) * price).toFixed(2) : "?";
      return [
        `**Trade prepared** (awaiting human approval)`,
        `Action: ${String(action).toUpperCase()} ${amount} ${token}`,
        price ? `Est. value: $${val} USD` : "",
        `⚠️ Requires wallet signature before execution.`,
      ].filter(Boolean).join("\n");
    }

    case "write_note": {
      const path = String(args.filename ?? "note.md");
      await store.put(path, String(args.content ?? ""));
      return `Saved ${path} (${String(args.content ?? "").length} chars)`;
    }

    case "read_note": {
      const content = await store.get(String(args.filename ?? ""));
      if (!content) throw new Error(`File not found: ${args.filename}`);
      return content;
    }

    case "list_notes": {
      const files = await store.list();
      return files.length > 0 ? files.join("\n") : "(empty workspace)";
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── CF AI Gateway LLM Call ───────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentBlock[];
  tool_call_id?: string;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface GatewayResponse {
  content?: Array<{
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  stop_reason?: string;
  // OpenAI-compatible fallback
  choices?: Array<{
    message: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
}

async function callGateway(
  env: Env,
  messages: ChatMessage[],
  withTools = true
): Promise<GatewayResponse> {
  // Strip provider prefix for AI binding (e.g. "workers-ai/@cf/..." → "@cf/...")
  const rawModel = env.AI_GATEWAY_MODEL || "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const model = rawModel.replace(/^workers-ai\//, "");

  // Normalize messages for Workers AI (content must be string)
  const aiMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));

  const runOptions: Record<string, unknown> = {
    messages: aiMessages,
    max_tokens: 1024,
  };

  if (withTools) {
    runOptions.tools = TOOLS.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  // Use AI binding — routed through AI Gateway when gateway.id is set
  const gatewayOpts = env.CF_GATEWAY_NAME
    ? { gateway: { id: env.CF_GATEWAY_NAME, skipCache: false } }
    : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (env.AI as any).run(model, runOptions, gatewayOpts) as {
    response?: string;
    tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  };

  // Normalize to OpenAI-compatible GatewayResponse shape
  if (result.tool_calls && result.tool_calls.length > 0) {
    return {
      choices: [{
        message: {
          content: result.response ?? "",
          tool_calls: result.tool_calls.map((tc, i) => ({
            id: `call_${i}`,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        },
        finish_reason: "tool_calls",
      }],
    };
  }

  return {
    choices: [{
      message: { content: result.response ?? "" },
      finish_reason: "stop",
    }],
  };
}

// ─── Agentic Loop (multi-turn tool calling) ───────────────────────────────────

async function runAgentLoop(
  env: Env,
  store: DOFileStore,
  history: ChatMessage[],
  onDelta?: (text: string) => void,
  onToolStart?: (name: string) => void
): Promise<{ reply: string; updatedHistory: ChatMessage[] }> {
  const messages = [...history];
  let finalReply = "";

  // Up to 5 tool-calling rounds
  for (let round = 0; round < 5; round++) {
    const response = await callGateway(env, messages);

    // Parse OpenAI-compatible response (Workers AI returns OpenAI format via gateway)
    const choice = response.choices?.[0];
    if (!choice) throw new Error("No response from gateway");

    const msg = choice.message;
    const assistantContent = msg.content ?? "";
    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      // Final text response
      finalReply = assistantContent;
      onDelta?.(assistantContent);
      messages.push({ role: "assistant", content: assistantContent });
      break;
    }

    // Has tool calls — execute them
    if (assistantContent) {
      onDelta?.(assistantContent + "\n");
    }
    messages.push({ role: "assistant", content: assistantContent });

    for (const call of toolCalls) {
      const name = call.function.name;
      const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;

      onToolStart?.(name);

      let result: string;
      try {
        result = await executeTool(name, args, store);
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }

      messages.push({
        role: "tool",
        content: result,
        tool_call_id: call.id,
      } as any);
    }

    // Loop continues — LLM will see tool results and respond
  }

  return { reply: finalReply, updatedHistory: messages };
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
      CREATE TABLE IF NOT EXISTS session_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
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
      const rows = this.loadHistory();
      return cors(Response.json({ history: rows }));
    }

    if (url.pathname === "/clear" && request.method === "POST") {
      this.sql.exec("DELETE FROM history");
      return cors(Response.json({ ok: true }));
    }

    if (url.pathname === "/info" && request.method === "GET") {
      const model = this.env.AI_GATEWAY_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      return cors(Response.json({
        model,
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

    switch (data.type) {
      case "message":
        if (data.content) await this.streamToWS(ws, data.content);
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "clear":
        this.sql.exec("DELETE FROM history");
        ws.send(JSON.stringify({ type: "cleared" }));
        break;
    }
  }

  async webSocketClose(): Promise<void> {}
  async webSocketError(_ws: WebSocket, err: unknown): Promise<void> {
    console.error("[AgentSession] WS error:", err);
  }

  // ─── Chat (HTTP) ──────────────────────────────────────────────────────────

  private async chat(userMessage: string): Promise<string> {
    const store = new DOFileStore(this.sql);
    this.saveMsg("user", userMessage);

    const messages = this.buildMessages();
    const { reply, updatedHistory } = await runAgentLoop(this.env, store, messages);

    // Persist only the new assistant message
    const lastAssistant = updatedHistory.filter(m => m.role === "assistant").pop();
    if (lastAssistant) {
      this.saveMsg("assistant", typeof lastAssistant.content === "string"
        ? lastAssistant.content
        : JSON.stringify(lastAssistant.content)
      );
    }

    return reply || "Done.";
  }

  // ─── Stream (WebSocket) ───────────────────────────────────────────────────

  private async streamToWS(ws: WebSocket, userMessage: string): Promise<void> {
    const store = new DOFileStore(this.sql);
    this.saveMsg("user", userMessage);
    ws.send(JSON.stringify({ type: "start" }));

    try {
      const messages = this.buildMessages();
      const { reply, updatedHistory } = await runAgentLoop(
        this.env,
        store,
        messages,
        (delta) => ws.send(JSON.stringify({ type: "delta", content: delta })),
        (name) => ws.send(JSON.stringify({ type: "tool_start", name }))
      );

      // Persist assistant reply
      const last = updatedHistory.filter(m => m.role === "assistant").pop();
      if (last) {
        this.saveMsg("assistant", typeof last.content === "string"
          ? last.content
          : JSON.stringify(last.content)
        );
      }

      if (!reply) {
        // If delta was already streamed, send a final end
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: "error",
        content: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      ws.send(JSON.stringify({ type: "end" }));
    }
  }

  // ─── History / Persistence ────────────────────────────────────────────────

  private buildMessages(): ChatMessage[] {
    const rows = this.loadHistory().slice(-20); // keep last 20 messages
    const msgs: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const r of rows) {
      msgs.push({ role: r.role as "user" | "assistant", content: r.content });
    }
    return msgs;
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

  getMeta(key: string): string | null {
    const rows = [...this.sql.exec("SELECT value FROM session_meta WHERE key = ?", key)];
    return rows.length > 0 ? (rows[0].value as string) : null;
  }

  setMeta(key: string, value: string): void {
    this.sql.exec(
      "INSERT OR REPLACE INTO session_meta (key, value) VALUES (?, ?)",
      key, value
    );
  }
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Gradience Agent — an autonomous AI in a decentralized agent network built on X Layer blockchain.

You have tools available:
- fetch_price: live crypto prices (Binance)
- evaluate_condition: check if price meets a threshold
- prepare_trade: prepare a DEX trade (requires human approval)
- write_note / read_note / list_notes: persistent workspace

Use tools autonomously when needed. For example, to check if ETH > $3000:
1. Call fetch_price(token="ETH")
2. Call evaluate_condition(value=<price>, operator=">", threshold=3000)
3. Report the result

Be concise and technically precise. Always note that trades require human wallet signature.`;

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
