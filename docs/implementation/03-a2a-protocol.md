# Agent-to-Agent (A2A) Economic Protocol

> Gradience 黑客松 Demo 级规范 — 实现者可直接照此编码，无需再问问题

---

## 1. 核心设计决策

| 问题 | 决策 | 理由 |
|------|------|------|
| Specialist Agent 是独立 DO 吗？ | **否，同一个 DO** | Demo 简化；每个 Specialist 是 AgentSession 内部的 wallet + tool set |
| 付款验证方式？ | **等 X Layer 链上确认** | 不能只验证签名，必须 1 个区块确认后才执行任务 |
| 预算分配比例？ | **固定比例（Demo）** | Price Agent 30%，Trade Agent 50%，Orchestrator 20% |
| 支付代币？ | **USDC on X Layer testnet** | `0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e` |
| 链上结算时机？ | **任务完成后，调 PaymentHub.createEscrow** | 一次性结算，不逐步付款 |

---

## 2. Agent 钱包体系

### 2.1 钱包派生规则

每个 AgentSession DO 持有一个 **主私钥**（来自 wrangler secret `NODE_PRIVATE_KEY`）。

每个 Specialist 的钱包从主私钥**确定性派生**：

```typescript
import { ethers } from "ethers";

// 主钱包 = Orchestrator 钱包
const orchestratorWallet = new ethers.Wallet(env.NODE_PRIVATE_KEY);

// Specialist 钱包派生
function deriveAgentWallet(masterKey: string, agentName: string): ethers.Wallet {
  // keccak256(masterKey + agentName) 作为子私钥
  const derivedKey = ethers.keccak256(
    ethers.toUtf8Bytes(masterKey + ":" + agentName)
  );
  return new ethers.Wallet(derivedKey);
}

const priceAgentWallet  = deriveAgentWallet(env.NODE_PRIVATE_KEY, "price-agent");
const tradeAgentWallet  = deriveAgentWallet(env.NODE_PRIVATE_KEY, "trade-agent");
```

### 2.2 三个 Agent 的地址

| Agent | 角色 | 派生方式 | 收款比例 |
|-------|------|---------|---------|
| Orchestrator | 调度 + 协调 | `NODE_PRIVATE_KEY` 直接 | 20% |
| Price Agent | 获取价格数据 | `keccak256(key + ":price-agent")` | 30% |
| Trade Agent | 评估条件 + 准备交易 | `keccak256(key + ":trade-agent")` | 50% |

---

## 3. A2A 支付流程

### 3.1 概念来源：HTTP 402

HTTP 402 Payment Required 协议的核心思想：
- **调用方（Orchestrator）** 请求服务
- **服务方（Specialist）** 先要求付款
- 调用方付款后，服务方才执行

在我们的实现里，Orchestrator 通过 **tool call** 调用 Specialist。支付发生在工具执行内部。

### 3.2 完整支付序列

```
用户钱包
  │
  │ createTask(budget=5 USDC)
  ▼
X Layer TaskManager
  │
  │ (Worker 监听到任务)
  ▼
AgentSession DO (Orchestrator)
  │
  ├─ [Tool: call_price_agent("ETH")]
  │     │
  │     │ 1. Orchestrator 向 Price Agent 转 1.5 USDC (30% of 5)
  │     │    → USDC.transfer(priceAgentWallet.address, 1_500_000)
  │     │    → 等待 X Layer 1 区块确认
  │     │ 2. 确认后，执行 fetch_price("ETH")
  │     │ 3. 返回 { price: 2847, txHash: "0x..." }
  │     │
  ├─ [Tool: call_trade_agent("BUY", "ETH", 2847)]
  │     │
  │     │ 1. Orchestrator 向 Trade Agent 转 2.5 USDC (50% of 5)
  │     │    → USDC.transfer(tradeAgentWallet.address, 2_500_000)
  │     │    → 等待 X Layer 1 区块确认
  │     │ 2. 确认后，执行 evaluate_condition + prepare_trade
  │     │ 3. 返回 { trade: "BUY 0.1 ETH", approved: false }
  │     │
  ├─ [Human-in-the-loop: requestConfirmation on-chain]
  │     │
  │     │ 用户在前端 MetaMask 批准
  │     │
  └─ 任务完成
        │
        │ PaymentHub.createEscrow(breakdown: [
        │   { agentOwner: orchestratorWallet, amount: 1 USDC },
        │   { agentOwner: priceAgentWallet,   amount: 1.5 USDC },
        │   { agentOwner: tradeAgentWallet,   amount: 2.5 USDC },
        │ ])
        │
        ▼
     链上结算完成，三个钱包余额变化可验证
```

---

## 4. 新增 Tool：`call_specialist_agent`

在 `AgentSession.ts` 的 `buildTools()` 中新增两个工具。

### 4.1 `call_price_agent`

```typescript
{
  name: "call_price_agent" as const,
  label: "call_price_agent",
  description: "雇佣 Price Agent 获取加密货币实时价格。会从 Orchestrator 钱包向 Price Agent 钱包支付 USDC。",
  parameters: Type.Object({
    token: Type.String({ description: "代币符号，如 ETH, BTC" }),
  }),
  execute: async (_id: string, { token }: { token: string }) => {
    const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
    const orchestratorWallet = new ethers.Wallet(env.NODE_PRIVATE_KEY, provider);
    const priceAgentWallet = deriveAgentWallet(env.NODE_PRIVATE_KEY, "price-agent");

    // === 1. 支付 ===
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_TRANSFER_ABI, orchestratorWallet);
    const feeAmount = 1_500_000n; // 1.5 USDC (6 decimals)
    const payTx = await usdcContract.transfer(priceAgentWallet.address, feeAmount);
    const receipt = await payTx.wait(1); // 等待 1 区块确认

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Payment to Price Agent failed: ${payTx.hash}`);
    }

    // === 2. 执行服务（支付确认后才执行）===
    const TICKERS: Record<string, string> = {
      ethereum: "ETH", bitcoin: "BTC", solana: "SOL", binancecoin: "BNB",
    };
    const ticker = TICKERS[token.toLowerCase()] ?? token.toUpperCase();
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${ticker}USDT`);
    if (!res.ok) throw new Error(`Binance API error for ${ticker}`);
    const data = await res.json() as { price: string };
    const price = parseFloat(data.price);

    const text = [
      `**Price Agent Report** (paid 1.5 USDC, tx: ${receipt.hash})`,
      `${ticker} = $${price.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD`,
    ].join("\n");

    return {
      content: [{ type: "text" as const, text }],
      details: { price, paymentTxHash: receipt.hash, paidTo: priceAgentWallet.address },
    };
  },
},
```

### 4.2 `call_trade_agent`

```typescript
{
  name: "call_trade_agent" as const,
  label: "call_trade_agent",
  description: "雇佣 Trade Agent 评估条件并准备 DEX 交易。会从 Orchestrator 钱包向 Trade Agent 钱包支付 USDC。",
  parameters: Type.Object({
    action:    Type.Union([Type.Literal("buy"), Type.Literal("sell")]),
    token:     Type.String({ description: "代币符号" }),
    price:     Type.Number({ description: "当前价格（USD）" }),
    threshold: Type.Number({ description: "触发条件价格（USD）" }),
    amount:    Type.String({ description: "交易数量，如 0.1" }),
  }),
  execute: async (_id: string, { action, token, price, threshold, amount }: any) => {
    const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
    const orchestratorWallet = new ethers.Wallet(env.NODE_PRIVATE_KEY, provider);
    const tradeAgentWallet = deriveAgentWallet(env.NODE_PRIVATE_KEY, "trade-agent");

    // === 1. 支付 ===
    const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_TRANSFER_ABI, orchestratorWallet);
    const feeAmount = 2_500_000n; // 2.5 USDC
    const payTx = await usdcContract.transfer(tradeAgentWallet.address, feeAmount);
    const receipt = await payTx.wait(1);

    if (!receipt || receipt.status !== 1) {
      throw new Error(`Payment to Trade Agent failed: ${payTx.hash}`);
    }

    // === 2. 执行服务 ===
    const conditionMet = action === "buy" ? price > threshold : price < threshold;
    const estValue = (parseFloat(amount) * price).toFixed(2);

    const text = [
      `**Trade Agent Report** (paid 2.5 USDC, tx: ${receipt.hash})`,
      `Condition: ${token} ${action === "buy" ? ">" : "<"} $${threshold} → **${conditionMet ? "TRUE ✓" : "FALSE ✗"}**`,
      conditionMet ? `Trade prepared: ${action.toUpperCase()} ${amount} ${token} (~$${estValue})` : "Condition not met, no trade prepared.",
      conditionMet ? `⚠️ Requires human wallet signature before execution.` : "",
    ].filter(Boolean).join("\n");

    return {
      content: [{ type: "text" as const, text }],
      details: { conditionMet, paymentTxHash: receipt.hash, paidTo: tradeAgentWallet.address },
    };
  },
},
```

---

## 5. 链上结算：PaymentHub.createEscrow

任务执行完毕后，`TaskExecutor.ts` 调用 PaymentHub 做最终结算。

```typescript
// packages/worker-cloudflare/src/executors/TaskExecutor.ts
// 在 completeTask() 方法末尾添加：

async function settlePayment(
  taskId: number,
  totalBudget: bigint, // USDC 6 decimals
  env: Env
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
  const wallet = new ethers.Wallet(env.NODE_PRIVATE_KEY, provider);

  const orchestratorAddr = wallet.address;
  const priceAgentAddr   = deriveAgentWallet(env.NODE_PRIVATE_KEY, "price-agent").address;
  const tradeAgentAddr   = deriveAgentWallet(env.NODE_PRIVATE_KEY, "trade-agent").address;

  // 固定比例（Demo）
  const priceAgentShare  = totalBudget * 30n / 100n;
  const tradeAgentShare  = totalBudget * 50n / 100n;
  const orchestratorShare = totalBudget - priceAgentShare - tradeAgentShare;

  const paymentHub = new ethers.Contract(PAYMENT_HUB_ADDRESS, PAYMENT_HUB_ABI, wallet);

  const tx = await paymentHub.createEscrow(taskId, totalBudget, [
    { agentOwner: priceAgentAddr,   amount: priceAgentShare,   description: "Price Agent fee (30%)" },
    { agentOwner: tradeAgentAddr,   amount: tradeAgentShare,   description: "Trade Agent fee (50%)" },
    { agentOwner: orchestratorAddr, amount: orchestratorShare, description: "Orchestrator fee (20%)" },
  ]);

  const receipt = await tx.wait(1);
  return receipt.hash;
}
```

---

## 6. 系统提示词更新

`AgentSession.ts` 的 `SYSTEM_PROMPT` 更新为：

```
你是 Gradience Orchestrator Agent — 去中心化 Agent 经济网络的调度中心。

你有两类工具：
【自有工具（免费）】
- fetch_price: 直接从 Binance 获取价格（免费，无需付款）
- evaluate_condition: 评估数值条件
- write_note / read_note / list_notes: 持久化工作区

【付费专家 Agent（每次调用需支付 USDC）】
- call_price_agent: 雇佣 Price Agent（费用 1.5 USDC）
  适合需要高质量价格分析的场景
- call_trade_agent: 雇佣 Trade Agent（费用 2.5 USDC）
  适合需要执行交易策略的场景

工作流程：
1. 收到用户任务后，判断是否需要专家 Agent
2. 如需要，先调用付费工具（会触发链上 USDC 转账并等待确认）
3. 获得专家结果后，综合分析，给出建议
4. 如果专家 Agent 准备了交易，告知用户需要钱包签名确认

重要：所有链上支付需要等待确认，请耐心等待，不要重复触发支付。
```

---

## 7. wrangler.toml 无需改动

由于 Specialist 是 Orchestrator DO 内部实现，不需要新增 DO 绑定。

唯一需要确认的 secret：
```bash
# 必须已设置
wrangler secret put NODE_PRIVATE_KEY   # Orchestrator/派生钱包的主私钥
wrangler secret put CF_GATEWAY_TOKEN   # CF AI Gateway token
```

---

## 8. 常量定义

在 `AgentSession.ts` 顶部添加：

```typescript
const USDC_ADDRESS = "0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e"; // X Layer testnet
const PAYMENT_HUB_ADDRESS = "0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60";

const USDC_TRANSFER_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

function deriveAgentWallet(masterKey: string, agentName: string) {
  const derivedKey = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
  return new ethers.Wallet(derivedKey);
}
```

---

## 9. 已知限制（Demo 可接受）

1. **钱包安全性低**：子私钥从主私钥直接派生，生产环境应用 BIP-44 HD wallet 或 OWS
2. **Agent 无独立身份**：未在 8004 registry 注册，未来版本应在 Agent 创建时调用 `agentRegistry8004`
3. **预算固定**：30/50/20 比例硬编码，未来应由 Orchestrator AI 自主决定
4. **单链支付**：仅 X Layer，未来通过 OWS 支持多链 + 402 协议标准化
