#!/usr/bin/env node
/**
 * AgentX Node Daemon
 *
 * 用法:
 *   npx @agentx/node@latest --server-url https://agentx-worker.davirain-yin.workers.dev --api-key sk_node_xxx
 *
 * 可选参数:
 *   --name        agent 名字（默认：机器名）
 *   --model       模型名（默认：claude-sonnet-4-6，或读 CLAUDE_MODEL 环境变量）
 *   --port        本地端口（默认：8787）
 *   --skip-tunnel 跳过隧道，仅本地运行
 */
import * as dotenv from "dotenv";
import * as os from "os";
import { createServer, agentMeta } from "./server";
import { startTunnel } from "./tunnel";
import { ClaudeBackend } from "./backends/claude";
import { PiBackend } from "./backends/pi";

dotenv.config();

// ── CLI 参数解析 ──────────────────────────────────────────────────────────────

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

const args = parseArgs();

const SERVER_URL = (args["server-url"] as string || process.env.AGENTX_SERVER_URL || "").replace(/\/+$/, "");
const API_KEY    = (args["api-key"]    as string || process.env.AGENTX_API_KEY    || "");
const PORT       = parseInt(args["port"] as string || process.env.PORT || "8787");
const SKIP_TUNNEL = args["skip-tunnel"] === true || process.env.SKIP_TUNNEL === "true";
const BACKEND    = (process.env.BACKEND || "claude") as "claude" | "pi";
const MODEL      = (args["model"] as string || process.env.CLAUDE_MODEL || "claude-sonnet-4-6");
const RAW_NAME   = (args["name"] as string || process.env.AGENT_NAME || os.hostname());
const AGENT_NAME = RAW_NAME.replace(/[^a-zA-Z0-9]/g, "_");
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// ── 校验 ──────────────────────────────────────────────────────────────────────

if (!SERVER_URL) {
  console.error("❌  --server-url is required");
  console.error("    例：--server-url https://agentx-worker.davirain-yin.workers.dev");
  process.exit(1);
}

if (!API_KEY || !API_KEY.startsWith("sk_node_")) {
  console.error("❌  --api-key is required (格式：sk_node_...)");
  console.error("    在 Dashboard 点 \"Add Node\" 生成你的 API Key");
  process.exit(1);
}

// ── 心跳 ─────────────────────────────────────────────────────────────────────

async function heartbeat(): Promise<void> {
  try {
    const res = await fetch(`${SERVER_URL}/api/nodes/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    });
    if (!res.ok) console.warn(`[heartbeat] ${res.status}`);
  } catch (err) {
    console.warn(`[heartbeat] failed: ${err instanceof Error ? err.message : err}`);
  }
}

// ── 注册到网络 ────────────────────────────────────────────────────────────────

async function connectToNetwork(endpoint: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/nodes/connect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      name: AGENT_NAME,
      model: MODEL,
      capabilities: BACKEND === "pi"
        ? ["chat", "price_oracle", "reasoning", "a2a_payment"]
        : ["chat", "reasoning", "code"],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Connect failed (${res.status})`);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  // 配置 agentMeta
  agentMeta.name = AGENT_NAME;
  agentMeta.backend = BACKEND;
  agentMeta.model = MODEL;

  // Backend factory
  const backendFactory = () => {
    if (BACKEND === "pi") return new PiBackend(ANTHROPIC_API_KEY, MODEL);
    return new ClaudeBackend(ANTHROPIC_API_KEY, MODEL);
  };

  if (!ANTHROPIC_API_KEY) {
    console.warn("⚠️  ANTHROPIC_API_KEY not set — chat 请求将会失败，请确保你的 AI 后端已配置");
  }

  // 启动 HTTP server
  const app = createServer(backendFactory);
  await new Promise<void>((resolve) => { app.listen(PORT, () => resolve()); });
  console.log(`✅ 本地服务已启动 http://localhost:${PORT}`);

  // 建隧道
  let publicUrl = process.env.TUNNEL_URL || `http://localhost:${PORT}`;
  if (!SKIP_TUNNEL && !process.env.TUNNEL_URL) {
    try {
      publicUrl = await startTunnel(PORT);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️  隧道启动失败: ${msg}`);
      console.warn("    设置 --skip-tunnel 跳过，或设置 TUNNEL_URL 使用已有隧道");
    }
  }

  agentMeta.endpoint = publicUrl;

  // 注册到网络
  try {
    await connectToNetwork(publicUrl);
    console.log(`✅ 已加入网络 → ${SERVER_URL}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ 加入网络失败: ${msg}`);
    process.exit(1);
  }

  // 打印 Banner
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🤖 AgentX Node — 已加入网络                               ║
║                                                           ║
║   Name    : ${AGENT_NAME.padEnd(44)}  ║
║   Model   : ${MODEL.padEnd(44)}  ║
║   Endpoint: ${publicUrl.padEnd(44)}  ║
║   Network : ${SERVER_URL.padEnd(44)}  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // 每 2 分钟心跳保活
  setInterval(heartbeat, 2 * 60 * 1000);

  process.on("SIGINT",  () => { console.log("\n🛑 节点已停止"); process.exit(0); });
  process.on("SIGTERM", () => { console.log("\n🛑 节点已停止"); process.exit(0); });
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});
