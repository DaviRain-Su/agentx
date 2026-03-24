/**
 * AgentSession - Durable Object for persistent, isolated AI agent sessions
 *
 * Each session is bound to:
 * - A verified Gradience task ID (on-chain proof of access)
 * - A wallet address (authenticated via signature)
 *
 * Uses SQLite (via Durable Objects storage.sql) for message persistence.
 * Supports WebSocket for real-time streaming.
 */

import { Env } from "../index";

const SYSTEM_PROMPT = `You are Gradience Agent — an AI operating within a decentralized agent orchestration network built on X Layer blockchain.

You help users with:
- DeFi task automation: price monitoring, condition evaluation, trade preparation
- Workflow creation and management on the Gradience network
- Smart contract interactions on X Layer (OKX's EVM L2)
- Market analysis: real-time crypto price data, trends
- Understanding on-chain task execution status and results

When users ask about token prices, note that the Gradience price-monitor workflow agent fetches live data from Binance.
When discussing trades, always note that human approval is required before any transaction is signed.
Be concise, technically precise, and helpful. Use markdown formatting for clarity.`;

export class AgentSession {
  private readonly sql: SqlStorage;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {
    this.sql = state.storage.sql;
    // Initialize tables on first access
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
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

    // HTTP chat (fallback for clients that don't support WebSocket)
    if (url.pathname === "/chat" && request.method === "POST") {
      const { message } = (await request.json()) as { message: string };
      const response = await this.processMessage(message);
      return cors(Response.json({ response }));
    }

    // Get conversation history
    if (url.pathname === "/history" && request.method === "GET") {
      const history = this.getHistory();
      return cors(Response.json({ history }));
    }

    // Clear history
    if (url.pathname === "/clear" && request.method === "POST") {
      this.sql.exec("DELETE FROM messages");
      return cors(Response.json({ ok: true }));
    }

    // Session info
    if (url.pathname === "/info" && request.method === "GET") {
      const taskId = this.getMeta("taskId");
      const address = this.getMeta("address");
      const messageCount = [...this.sql.exec("SELECT COUNT(*) as cnt FROM messages")][0]?.cnt ?? 0;
      return cors(Response.json({ taskId, address, messageCount }));
    }

    return new Response("Not found", { status: 404 });
  }

  // ─── WebSocket Handlers ────────────────────────────────────────────────────

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
        if (data.content) {
          await this.streamToWebSocket(ws, data.content);
        }
        break;
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "clear":
        this.sql.exec("DELETE FROM messages");
        ws.send(JSON.stringify({ type: "cleared" }));
        break;
      default:
        ws.send(JSON.stringify({ type: "error", content: `Unknown message type: ${data.type}` }));
    }
  }

  async webSocketClose(_ws: WebSocket, _code: number, _reason: string): Promise<void> {
    // Session persists in SQLite even after WebSocket closes
  }

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.error("[AgentSession] WebSocket error:", error);
  }

  // ─── Agent Logic ──────────────────────────────────────────────────────────

  private async processMessage(userMessage: string): Promise<string> {
    this.saveMessage("user", userMessage);
    const history = this.buildMessageHistory();

    try {
      const response = (await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
        max_tokens: 1000,
      })) as { response: string };

      const reply = response.response?.trim() || "I couldn't process that request.";
      this.saveMessage("assistant", reply);
      return reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error: ${msg}`;
    }
  }

  private async streamToWebSocket(ws: WebSocket, userMessage: string): Promise<void> {
    this.saveMessage("user", userMessage);
    const history = this.buildMessageHistory();

    ws.send(JSON.stringify({ type: "start" }));

    try {
      const response = (await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
        max_tokens: 1000,
      })) as { response: string };

      const reply = response.response?.trim() || "I couldn't process that request.";
      this.saveMessage("assistant", reply);
      ws.send(JSON.stringify({ type: "message", content: reply }));
    } catch (err) {
      ws.send(JSON.stringify({
        type: "error",
        content: `Agent error: ${err instanceof Error ? err.message : String(err)}`,
      }));
    } finally {
      ws.send(JSON.stringify({ type: "end" }));
    }
  }

  // ─── Storage Helpers ──────────────────────────────────────────────────────

  private buildMessageHistory(): Array<{ role: "user" | "assistant"; content: string }> {
    // Keep last 20 messages to stay within context limits
    const rows = this.getHistory().slice(-20);
    return rows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));
  }

  private getHistory(): Array<{ role: string; content: string; created_at: number }> {
    const cursor = this.sql.exec(
      "SELECT role, content, created_at FROM messages ORDER BY id"
    );
    return [...cursor].map((row) => ({
      role: row.role as string,
      content: row.content as string,
      created_at: row.created_at as number,
    }));
  }

  private saveMessage(role: string, content: string): void {
    this.sql.exec(
      "INSERT INTO messages (role, content, created_at) VALUES (?, ?, ?)",
      role,
      content,
      Date.now()
    );
  }

  private getMeta(key: string): string | null {
    const cursor = this.sql.exec("SELECT value FROM session_meta WHERE key = ?", key);
    const rows = [...cursor];
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
