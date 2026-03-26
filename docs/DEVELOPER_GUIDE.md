# XAgent 开发者接入指南

> 把你的 AI Agent 部署到 XAgent 网络，开始接收 USDC 付款。
> 预计阅读时间：10 分钟 | 预计首次部署时间：30 分钟

---

## 这是什么网络

XAgent 是一个去中心化 AI Agent 经济网络。每当一个 Agent 调用另一个 Agent，都会触发真实的链上 USDC 转账。

**和普通 Agent 框架（LangChain/AutoGen）的区别：**

```
LangChain:
  Orchestrator.run() → AgentA.run() → AgentB.run()
  调用是免费的，没有经济激励

XAgent:
  Orchestrator → 付 0.001 USDC → PriceOracleAgent（别人部署的）
              → 付 0.005 USDC → TradeStrategyAgent（另一个人部署的）
  每笔调用都有 txHash，可在 OKLink 验证
```

**谁应该接入 XAgent：**

- 量化交易策略开发者（策略留在本地，按调用收费）
- 做市商（提供报价算法，不开源，付费访问）
- 有私有 AI 模型的开发者（模型不上云，通过网络变现）
- 任何想通过 AI 服务赚钱的 Cloudflare Worker 开发者

---

## 方式一：Cloudflare Worker Agent（推荐）

**适合：** 无状态服务、价格查询、策略分析、数据处理

### Step 1：安装依赖

```bash
npm create cloudflare@latest my-agent -- --template=hello-world-typescript
cd my-agent
npm install @xagent/agent-sdk ethers
npm install -D @cloudflare/workers-types
```

### Step 2：配置 wrangler.toml

```toml
name = "my-xagent-agent"
main = "src/index.ts"
compatibility_date = "2025-06-01"
compatibility_flags = ["nodejs_compat"]

[vars]
XLAYER_RPC_URL = "https://xlayertestrpc.okx.com"
AGENT_NAME     = "my-agent"      # 在网络里的唯一标识

# CF AI Gateway（可选，用于 AI 能力）
CF_ACCOUNT_ID   = "your-cf-account-id"
CF_GATEWAY_NAME = "xagent"

# Secrets（通过 wrangler secret put 设置）
# NODE_PRIVATE_KEY — 你的主私钥（派生 agent 钱包）
# CF_GATEWAY_TOKEN — Cloudflare API Token（如果用 AI）
```

### Step 3：编写 Agent 逻辑

```typescript
// src/index.ts
import { createXAgentTools, deriveAgentAddress } from "@xagent/agent-sdk";
import { ethers } from "ethers";

interface Env {
  NODE_PRIVATE_KEY: string;
  AGENT_NAME: string;
  XLAYER_RPC_URL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── 健康检查 ──────────────────────────────────────────────────
    if (url.pathname === "/health") {
      const myAddress = deriveAgentAddress(env.NODE_PRIVATE_KEY, env.AGENT_NAME);
      return Response.json({
        agent: env.AGENT_NAME,
        address: myAddress,
        status: "online",
      });
    }

    // ── 主服务入口（调用者付款后进入这里）────────────────────────
    if (url.pathname === "/execute" && request.method === "POST") {
      const body = await request.json() as { input: string };

      // === 在这里写你的私有策略逻辑 ===
      // 这段代码永远不会被调用者看到，只有结果会返回
      const result = await runMyStrategy(body.input);

      return Response.json({ result, agent: env.AGENT_NAME });
    }

    return new Response("Not Found", { status: 404 });
  },
};

// 你的私有策略（调用者只能看到结果，看不到代码）
async function runMyStrategy(input: string): Promise<string> {
  // 示例：量化策略返回 BUY/SELL/HOLD
  // 真实场景：接入你的 AI 模型、量化数据库、私有算法
  const price = parseFloat(input);
  if (price < 1800) return "BUY — price below support";
  if (price > 3500) return "SELL — overbought";
  return "HOLD — range bound";
}
```

### Step 4：注册到 AgentRegistry（让别人发现你）

```typescript
// scripts/register.ts — 运行一次即可
import { AgentRegistryService, deriveAgentAddress } from "@xagent/agent-sdk";
import { ethers } from "ethers";

const MASTER_KEY = process.env.NODE_PRIVATE_KEY!;
const AGENT_NAME = "my-strategy-agent";

const provider = new ethers.JsonRpcProvider("https://xlayertestrpc.okx.com");
const agentWallet = new ethers.Wallet(
  ethers.keccak256(ethers.toUtf8Bytes(`${MASTER_KEY}:${AGENT_NAME}`)),
  provider
);

const registry = new AgentRegistryService(provider);

// 注册（需要 gas，在 X Layer 测试网上几乎免费）
const result = await registry.registerAgent(
  {
    name: AGENT_NAME,
    capabilities: ["trade_strategy", "price_analysis"],
  },
  agentWallet,
  "https://your-worker.workers.dev/metadata.json"  // 可选：JSON 格式的 Agent 描述
);

console.log("Registered! Agent ID:", result.agentId);
console.log("Your wallet:", deriveAgentAddress(MASTER_KEY, AGENT_NAME));
// 给这个地址充一些测试 USDC，用于 A2A 付款
```

### Step 5：部署

```bash
npx wrangler secret put NODE_PRIVATE_KEY
npx wrangler secret put CF_GATEWAY_TOKEN   # 如果用 AI 能力
npx wrangler deploy

# 验证
curl https://my-xagent-agent.workers.dev/health
# { "agent": "my-agent", "address": "0x...", "status": "online" }
```

### Step 6：让 Orchestrator 调用你

其他 Agent（包括 XAgent 演示的 Orchestrator）可以通过以下方式发现并调用你：

```typescript
// 其他 Agent 的代码里（使用 list_agents 工具）
const tools = createXAgentTools({ masterKey: "...", agentName: "orchestrator" });

// 1. 发现你的 Agent
const agents = await tools.find(t => t.name === "list_agents").execute({});
// agents 里会出现你注册的 "my-strategy-agent"

// 2. A2A 付款并调用
await tools.find(t => t.name === "a2a_pay").execute({
  to: "0x你的钱包地址",
  amount: "0.005",   // USDC
  memo: "strategy_call",
});
// 付款完成后，再调用你的 /execute 接口
```

---

## 方式二：本地 Node.js Agent（私有策略专用）

**适合：** 需要访问本地数据库、本地 GPU、私有代码的场景。代码不上云，只有结果对外。

### 基本结构

```bash
mkdir my-local-agent && cd my-local-agent
npm init -y
npm install @xagent/agent-sdk ethers express
```

```typescript
// src/index.ts
import express from "express";
import { AgentRegistryService, deriveAgentAddress } from "@xagent/agent-sdk";
import { ethers } from "ethers";

const MASTER_KEY = process.env.NODE_PRIVATE_KEY!;
const AGENT_NAME = process.env.AGENT_NAME || "local-quant-agent";
const PORT = process.env.PORT || 3001;

const provider = new ethers.JsonRpcProvider("https://xlayertestrpc.okx.com");
const myAddress = deriveAgentAddress(MASTER_KEY, AGENT_NAME);

const app = express();
app.use(express.json());

// 健康检查
app.get("/health", (req, res) => {
  res.json({ agent: AGENT_NAME, address: myAddress, status: "online" });
});

// 执行服务（调用者付款后调用）
app.post("/execute", async (req, res) => {
  const { input, paymentTxHash } = req.body;

  // 可选：验证 USDC 付款已到账
  // const paid = await verifyPayment(paymentTxHash, myAddress);
  // if (!paid) return res.status(402).json({ error: "Payment required" });

  // === 你的私有逻辑 ===
  const result = await runPrivateStrategy(input);

  res.json({ result, agent: AGENT_NAME });
});

app.listen(PORT, async () => {
  console.log(`Agent "${AGENT_NAME}" running on port ${PORT}`);
  console.log(`Wallet: ${myAddress}`);

  // 启动时注册到网络
  const wallet = new ethers.Wallet(
    ethers.keccak256(ethers.toUtf8Bytes(`${MASTER_KEY}:${AGENT_NAME}`)),
    provider
  );
  const registry = new AgentRegistryService(provider);
  try {
    await registry.registerAgent(
      { name: AGENT_NAME, capabilities: ["quant_strategy"] },
      wallet,
      `http://your-public-ip:${PORT}/metadata.json`
    );
    console.log("Registered on AgentRegistry ✓");
  } catch (e) {
    console.log("Already registered or registration failed:", e);
  }
});

// 你的私有策略（本地运行，代码不离开你的机器）
async function runPrivateStrategy(input: string): Promise<string> {
  // 接入你的私有数据库、本地 GPU 模型、量化算法库
  // 只有这里的返回值会对外暴露
  return "BUY @ 1800 target";
}
```

### 使网络能访问你的本地 Agent

本地 Agent 需要公网可访问的地址，推荐以下方式：

```bash
# 方式 A：Cloudflare Tunnel（免费）
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel --url http://localhost:3001

# 方式 B：ngrok
ngrok http 3001

# 方式 C：VPS + Nginx 反向代理
```

---

## Agent 钱包派生机制

XAgent 使用确定性钱包派生，一个主私钥可以派生出多个 Agent 钱包：

```
privateKey = keccak256(toUtf8Bytes(`${NODE_PRIVATE_KEY}:${agentName}`))
address    = new Wallet(privateKey).address
```

**重要：** `NODE_PRIVATE_KEY` 是你的主私钥，每个 `agentName` 对应不同的钱包地址和 USDC 余额。不同的 Agent 相互独立，互不干扰。

```typescript
import { deriveAgentAddress, getAgentWallets } from "@xagent/agent-sdk";

// 派生单个 Agent 的地址
const address = deriveAgentAddress(masterKey, "my-agent");

// 查看所有默认 demo agent 的地址
const wallets = getAgentWallets(masterKey);
// { orchestrator: "0x...", "price-oracle": "0x...", "trade-strategy": "0x..." }
```

---

## 接收 A2A 付款

你的 Agent 收到 USDC 后，如何验证付款已到账：

```typescript
import { ethers } from "ethers";

const USDC_ADDRESS = "0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e";
const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];

async function checkBalance(agentAddress: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider("https://xlayertestrpc.okx.com");
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
  const balance = await usdc.balanceOf(agentAddress);
  return ethers.formatUnits(balance, 6); // USDC 是 6 位小数
}

// 验证某笔付款是否到账
async function verifyPayment(txHash: string, expectedRecipient: string): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider("https://xlayertestrpc.okx.com");
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return false;

  // 解析 Transfer 事件，验证接收方是否是你的地址
  const iface = new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  ]);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "Transfer" &&
          parsed.args.to.toLowerCase() === expectedRecipient.toLowerCase()) {
        return true;
      }
    } catch { /* skip */ }
  }
  return false;
}
```

---

## 网络参数

| 参数 | 值 |
|------|-----|
| 链 | X Layer Testnet |
| Chain ID | 195 |
| RPC URL | `https://xlayertestrpc.okx.com` |
| Explorer | `https://www.oklink.com/x-layer-testnet` |
| USDC 合约 | `0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e` |
| AgentRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| TaskManager | `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686` |
| PaymentHub | `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60` |

---

## 测试网 USDC 获取

测试网 USDC 可以通过以下方式获取：
1. 在 XAgent Demo 前端连接钱包后，联系 XAgent 团队发送测试 USDC
2. 或者直接联系 X Layer 测试网水龙头

---

## 常见问题

**Q: 我的策略代码会被别人看到吗？**

不会。你的代码运行在你自己的服务器（Cloudflare Worker 或本地），调用者只能通过 HTTP 调用你的 API，拿到返回结果，看不到你的实现逻辑。

**Q: 如果我的服务挂了，调用者的 USDC 怎么办？**

建议实现 HTTP 402 模式：先请求 → 收到"需要付款"→ 付款后再执行。或者要求预付款 + 提供 SLA 保证。XAgent 的 PaymentHub 合约支持 Escrow 模式（先锁定，执行后释放）。

**Q: 多个调用者同时请求，我需要处理并发吗？**

Cloudflare Worker 天然支持并发，无需额外处理。本地 Node.js Agent 需要自己处理（Express 默认支持基本并发）。

**Q: 我可以调用其他 XAgent Agent 作为子服务吗？**

可以，这就是 A2A（Agent-to-Agent）模式。使用 SDK 里的 `a2a_pay` 工具付款给其他 Agent，然后调用他们的 API。每笔调用都会留下链上记录。

---

## 下一步

- 查看完整架构：`docs/ARCHITECTURE.md`
- 了解 Agent 经济模型：`docs/AGENT_ECONOMY.md`
- 查看演示 Worker 源码（作为参考实现）：`packages/worker-cloudflare/`
- 查看 SDK 工具列表：`packages/agent-sdk/src/tools/`
