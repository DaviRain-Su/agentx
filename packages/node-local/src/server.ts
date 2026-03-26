import express, { Request, Response, NextFunction } from "express";
import { createSession, chatInSession, getSessionHistory, clearSessionHistory } from "./session";
import { ClaudeBackend } from "./backends/claude";
import { PiBackend } from "./backends/pi";

export interface AgentMetadata {
  name: string;
  backend: string;
  model: string;
  endpoint: string;
  capabilities: string[];
  pricing: { perCall: string };
  description: string;
}

// Mutable metadata — filled in by index.ts after tunnel starts
export const agentMeta: AgentMetadata = {
  name: "local-agent",
  backend: "claude",
  model: "claude-sonnet-4-6",
  endpoint: "",
  capabilities: ["chat", "reasoning", "code"],
  pricing: { perCall: "0" },
  description: "Local AgentX node",
};

export function createServer(backendFactory: () => ClaudeBackend | PiBackend): express.Application {
  const app = express();
  app.use(express.json());

  // CORS — allow frontend (Vercel) to call directly
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      agent: agentMeta.name,
      backend: agentMeta.backend,
      model: agentMeta.model,
      uptime: Math.floor(process.uptime()),
    });
  });

  // ── Metadata (fetched by frontend to discover endpoint) ──────────────────
  app.get("/metadata.json", (_req: Request, res: Response) => {
    res.json(agentMeta);
  });

  // ── Agent info (mirrors CF Worker /api/agents) ────────────────────────────
  app.get("/api/agents", (_req: Request, res: Response) => {
    res.json({
      [agentMeta.name]: {
        address: "",
        fee: agentMeta.pricing.perCall === "0" ? "Free" : `${agentMeta.pricing.perCall} USDC`,
        capabilities: agentMeta.capabilities,
        model: agentMeta.model,
        backend: agentMeta.backend,
        endpoint: agentMeta.endpoint,
      },
    });
  });

  // ── Deploy session ────────────────────────────────────────────────────────
  app.post("/api/deploy", (req: Request, res: Response) => {
    const backend = backendFactory();
    const sessionId = createSession(backend, agentMeta.name);
    res.json({
      sessionId,
      chatUrl: `/agent/chat/${sessionId}`,
      wsUrl: `/agent/ws/${sessionId}`,
    });
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  app.post("/agent/chat/:sessionId", async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { message } = req.body as { message?: string };

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message (string) is required" });
      return;
    }

    try {
      const response = await chatInSession(String(sessionId), message);
      res.json({ response });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // ── History ───────────────────────────────────────────────────────────────
  app.get("/agent/history/:sessionId", (req: Request, res: Response) => {
    const history = getSessionHistory(String(req.params.sessionId));
    res.json({ history });
  });

  // ── Clear ─────────────────────────────────────────────────────────────────
  app.post("/agent/clear/:sessionId", (req: Request, res: Response) => {
    clearSessionHistory(String(req.params.sessionId));
    res.json({ ok: true });
  });

  return app;
}
