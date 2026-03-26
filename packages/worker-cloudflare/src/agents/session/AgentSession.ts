import { Agent } from "@mariozechner/pi-agent-core";
import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai/openai-completions";
import type { Env } from "../../index";
import { DEFAULT_GATEWAY_MODEL, SYSTEM_PROMPT } from "./constants";
import { cors, corsHeaders } from "./cors";
import { buildGatewayModel } from "./model";
import { extractRealtimePriceToken, fetchRealtimePriceTextWithEnv } from "./pricing";
import { DOFileStore, seedMessagesFromHistory } from "./store";
import { buildAgentTools } from "./tools";
import type { PersistedPiState } from "./types";

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
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS pi_state (
        id      INTEGER PRIMARY KEY CHECK(id = 1),
        state   TEXT NOT NULL,
        updated INTEGER NOT NULL
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
      this.sql.exec("DELETE FROM pi_state");
      return cors(Response.json({ ok: true }));
    }

    if (url.pathname === "/info" && request.method === "GET") {
      return cors(Response.json({
        model: this.env.AI_GATEWAY_MODEL || DEFAULT_GATEWAY_MODEL,
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
      this.sql.exec("DELETE FROM pi_state");
      ws.send(JSON.stringify({ type: "cleared" }));
    }
  }

  async webSocketClose(): Promise<void> {}
  async webSocketError(_ws: WebSocket, err: unknown): Promise<void> {
    console.error("[AgentSession] WS error:", err);
  }

  private async fallbackGatewayReply(userMessage: string): Promise<string | null> {
    // Try Workers AI binding first (free, no gateway config needed)
    if (this.env.AI) {
      try {
        const result = await (this.env.AI as any).run(
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
          {
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMessage },
            ],
            max_tokens: 1200,
          }
        );
        const text = result?.response || result?.result?.response || "";
        if (text.trim()) return text;
      } catch (e) {
        console.error("[AgentSession] Workers AI fallback error:", e);
      }
    }

    // Fallback to AI Gateway
    try {
      const modelId = this.env.AI_GATEWAY_MODEL?.trim() || DEFAULT_GATEWAY_MODEL;
      const endpoint = `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(this.env.CF_ACCOUNT_ID)}/${encodeURIComponent(this.env.CF_GATEWAY_NAME)}/compat/chat/completions`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.env.CF_GATEWAY_TOKEN ? { Authorization: `Bearer ${this.env.CF_GATEWAY_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          model: modelId,
          max_tokens: 1200,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return `Gateway fallback failed (${res.status}): ${text.slice(0, 240)}`;
      }
      const completion = await res.json() as {
        result?: { choices?: Array<{ message?: { content?: string | null } }> };
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = completion.result?.choices?.[0]?.message?.content
        || completion.choices?.[0]?.message?.content
        || "";
      return content.trim() ? content : null;
    } catch {
      return null;
    }
  }

  private async chat(userMessage: string): Promise<string> {
    const store = new DOFileStore(this.sql);
    const persistedState = this.loadPersistedPiState();
    const history = this.loadHistory().slice(-20);

    // ── Direct tool dispatch (keyword-based) ──────────────────────────────
    // Ensures A2A payments and swarm tools execute reliably regardless of LLM tool-calling support
    const tools = buildAgentTools(store, this.env);
    const directResult = await this.tryDirectToolDispatch(userMessage, tools);
    if (directResult) {
      this.saveMsg("user", userMessage);
      this.saveMsg("assistant", directResult);
      this.persistHistoryToPiState(persistedState);
      return directResult;
    }

    const directPriceToken = extractRealtimePriceToken(userMessage);
    if (directPriceToken) {
      this.saveMsg("user", userMessage);
      try {
        const realtime = await fetchRealtimePriceTextWithEnv(directPriceToken, this.env);
        this.saveMsg("assistant", realtime);
        this.persistHistoryToPiState(persistedState);
        return realtime;
      } catch (error) {
        const message = `Realtime price unavailable for ${directPriceToken}: ${error instanceof Error ? error.message : String(error)}`;
        this.saveMsg("assistant", message);
        this.persistHistoryToPiState(persistedState);
        return message;
      }
    }

    const model = buildGatewayModel(this.env, persistedState?.model);
    const apiKey = this.env.CF_GATEWAY_TOKEN?.trim() || "cf-gateway-token-not-required";
    const messages = persistedState?.messages?.length
      ? persistedState.messages
      : seedMessagesFromHistory(history);
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: (persistedState?.thinkingLevel as any) || "medium",
        tools: buildAgentTools(store, this.env),
        messages: messages as any[],
      },
      streamFn: (m, context, options) => streamSimpleOpenAICompletions(m as any, context, {
        ...options,
        apiKey,
      }),
    });

    this.saveMsg("user", userMessage);
    try {
      await agent.prompt(userMessage);
    } catch (error) {
      const fallback = await this.fallbackGatewayReply(userMessage);
      const message = fallback || `Agent execution failed: ${error instanceof Error ? error.message : String(error)}`;
      this.saveMsg("assistant", message);
      this.persistPiState(agent);
      return message;
    }

    const assistantMsgs = (agent.state.messages as any[]).filter((m) => m.role === "assistant");
    let response = "";
    for (let i = assistantMsgs.length - 1; i >= 0; i--) {
      const msg = assistantMsgs[i];
      const text = Array.isArray(msg?.content)
        ? msg.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("")
        : (typeof msg?.content === "string" ? msg.content : "");
      if (text.trim()) {
        response = text;
        break;
      }
    }

    if (!response.trim()) {
      const fallback = await this.fallbackGatewayReply(userMessage);
      response = fallback || "Agent returned an empty response. Check model/gateway credentials.";
    }

    this.saveMsg("assistant", response);
    this.persistPiState(agent);
    return response;
  }

  /**
   * Keyword-based direct tool dispatch.
   * Ensures A2A payment tools fire reliably even when the LLM doesn't support tool calling.
   */
  private async tryDirectToolDispatch(msg: string, tools: any[]): Promise<string | null> {
    const lower = msg.toLowerCase();
    const findTool = (name: string) => tools.find((t: any) => t.name === name);

    // "analyze X" / "swarm analysis" / "should I buy X" → run_swarm_analysis
    const swarmMatch = lower.match(/(?:analy[sz]e|swarm|should i (?:buy|sell)|full analysis)\s+(\w+)/);
    if (swarmMatch || lower.includes("swarm analysis") || lower.includes("run_swarm")) {
      const token = swarmMatch?.[1]?.toUpperCase() || "ETH";
      const tool = findTool("run_swarm_analysis");
      if (tool) {
        const result = await tool.execute("direct", { token, condition: `${token} > 0` });
        return result.content[0]?.text || "Swarm analysis completed.";
      }
    }

    // "hire price agent" / "hire_price_agent" / "paid price X"
    if (lower.includes("hire price") || lower.includes("hire_price") || lower.includes("paid price")) {
      const tokenMatch = lower.match(/(?:for|of|price)\s+(\w+)/);
      const token = tokenMatch?.[1]?.toUpperCase() || "ETH";
      const tool = findTool("hire_price_agent");
      if (tool) {
        const result = await tool.execute("direct", { token });
        return result.content[0]?.text || "Price agent hired.";
      }
    }

    // "hire trade agent" / "hire_trade_agent" / "trade recommendation"
    if (lower.includes("hire trade") || lower.includes("hire_trade") || lower.includes("trade recommendation")) {
      const token = "ETH";
      const tool = findTool("hire_trade_agent");
      if (tool) {
        const result = await tool.execute("direct", { token, price: 0, condition: `${token} > 0` });
        return result.content[0]?.text || "Trade agent hired.";
      }
    }

    // "list agents" / "show agents" / "agent network"
    if (lower.includes("list agent") || lower.includes("show agent") || lower.includes("agent network") || lower.includes("agent swarm")) {
      const tool = findTool("list_agents");
      if (tool) {
        const result = await tool.execute("direct", {});
        return result.content[0]?.text || "No agents found.";
      }
    }

    return null; // no match — fall through to LLM
  }

  private loadPersistedPiState(): PersistedPiState | undefined {
    const rows = [...this.sql.exec("SELECT state FROM pi_state WHERE id = 1")];
    if (rows.length === 0) return undefined;
    try { return JSON.parse(rows[0].state as string) as PersistedPiState; }
    catch { return undefined; }
  }

  private persistPiState(agent: Agent): void {
    const model = agent.state.model;
    const state: PersistedPiState = {
      messages: agent.state.messages,
      model: model ? { provider: model.provider, id: model.id } : undefined,
      thinkingLevel: agent.state.thinkingLevel,
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO pi_state (id, state, updated) VALUES (1, ?, ?)",
      JSON.stringify(state), Date.now()
    );
  }

  private persistHistoryToPiState(existing?: PersistedPiState): void {
    const state: PersistedPiState = {
      messages: seedMessagesFromHistory(this.loadHistory().slice(-40)),
      model: existing?.model || {
        provider: "ai-gateway",
        id: this.env.AI_GATEWAY_MODEL?.trim() || DEFAULT_GATEWAY_MODEL,
      },
      thinkingLevel: existing?.thinkingLevel || "medium",
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO pi_state (id, state, updated) VALUES (1, ?, ?)",
      JSON.stringify(state), Date.now()
    );
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
