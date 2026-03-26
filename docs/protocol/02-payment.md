# XAgent 支付协议

> 覆盖两种支付模式：用户→Agent（USDC 托管）和 Agent→Agent（A2A 微支付）

---

## 1. 为什么需要两套支付协议

```
用户 → Agent 支付                    Agent → Agent 支付
─────────────────────                ────────────────────
• 金额大（5-100 USDC）               • 金额小（0.1-5 USDC）
• 需要人工确认                        • 全自动，无需审批
• 安全优先（托管合约保护）              • 速度优先（立即结算）
• 一次性结算                          • 频繁调用（每次工具调用）
• 使用 PaymentHub 托管               • 使用直接 USDC 转账
```

---

## 2. 协议 A：用户 → Agent 支付（PaymentHub 托管）

### 2.1 合约

```
PaymentHub: 0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60 (X Layer testnet)
USDC:       0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e
```

### 2.2 完整支付流程

```
用户
  │
  │  Step 1: USDC.approve(PaymentHub, budget)
  │          让 PaymentHub 能从用户钱包扣款
  │
  ▼
TaskManager.createTask(workflowHash, agentDIDs[], budget)
  │
  │  链上事件: TaskCreated(taskId, requester, workflowHash, budget)
  │
  ▼
Worker 监听到事件，开始执行
  │
  │  执行过程中，预算锁定在 PaymentHub
  │
  ▼
任务完成后: PaymentHub.createEscrow(taskId, totalAmount, breakdown[])
  │
  │  breakdown = [
  │    { agentOwner: orchestratorAddr, amount: 1 USDC,   description: "Orchestrator (20%)" },
  │    { agentOwner: priceAgentAddr,   amount: 1.5 USDC, description: "Price Agent (30%)" },
  │    { agentOwner: tradeAgentAddr,   amount: 2.5 USDC, description: "Trade Agent (50%)" },
  │  ]
  │
  ▼
各 Agent 钱包余额增加（链上可验证）
```

### 2.3 失败场景处理

| 情况 | 处理方式 |
|------|---------|
| 用户余额不足 USDC | createTask 前检查 balanceOf，提示充值 |
| 任务执行失败 | Worker 调用 PaymentHub.refund(taskId)，退款给用户 |
| 人工审批超时 | TaskManager.handleTimeout → 自动退款 |
| Agent 执行中断 | 分布式锁超时后，可重新执行或退款 |

### 2.4 费用结构

```
黑客松 Demo 固定比例:
  Orchestrator Agent: 20%
  Primary Specialist: 50%（通常是执行类 Agent）
  Secondary Specialist: 30%（通常是数据类 Agent）

未来动态定价:
  • Orchestrator AI 根据任务复杂度自主分配
  • Agent 可在 Registry 中公示自己的 pricePerCall
  • 竞价机制：多个 Agent 竞标同一任务
```

---

## 3. 协议 B：Agent → Agent 支付（A2A 微支付）

### 3.1 设计原则

A2A 支付的灵感来自 **HTTP 402 Payment Required**：
- Orchestrator 调用 Specialist 的"服务端口"
- Specialist 要求先付款
- 付款确认后，Specialist 执行服务并返回结果

### 3.2 当前实现（黑客松 Demo）

```typescript
// Orchestrator Agent 内的工具调用

// Step 1: USDC 直接转账
const payTx = await usdcContract.transfer(specialistWallet.address, feeAmount);
await payTx.wait(1); // 等待 1 区块确认（X Layer ~2秒）

// Step 2: 付款确认后执行服务
const result = await executeSpecialistLogic(args);

// Step 3: 返回结果（包含 txHash 作为支付证明）
return { result, paymentTxHash: payTx.hash };
```

### 3.3 未来标准实现（x402 协议）

```
HTTP/1.1 POST /specialist/execute
Content-Type: application/json

{
  "task": "fetch_eth_price",
  "args": { "token": "ETH" }
}

↓ Specialist 要求付款

HTTP/1.1 402 Payment Required
Content-Type: application/json
X-Payment-Required: {
  "chain": "eip155:195",
  "token": "0x67d0E8f4...",
  "amount": "1500000",
  "recipient": "0x[SpecialistWallet]",
  "expires": 1743000060
}

↓ Orchestrator 完成付款

HTTP/1.1 POST /specialist/execute
X-Payment-Proof: {
  "txHash": "0x...",
  "chain": "eip155:195",
  "from": "0x[OrchestratorWallet]",
  "to": "0x[SpecialistWallet]",
  "amount": "1500000",
  "blockNumber": 12345
}

↓ Specialist 验证后执行

HTTP/1.1 200 OK
{
  "price": 2847.32,
  "source": "Binance",
  "timestamp": 1743000055
}
```

### 3.4 OWS（Open Wallet Standard）集成路径

```
当前（黑客松）:
  子私钥派生 → 直接 ethers.Wallet.transfer()

Phase 2（黑客松后）:
  OWS daemon 运行在 VPS
  CF Worker → REST → OWS API → 签名

OWS 优势:
  • 一个 wallet，同时有 EVM + Solana 地址
  • Policy engine：限制 Agent 只能在特定链/金额范围内签名
  • API key 访问：Agent 用 ows_key_xxx token，永远不接触私钥
  • HTTP 402 自动处理（OWS CLI 内置）
```

---

## 4. 多链支付路由

```
用户选择 X Layer:
  USDC (eip155:195) → PaymentHub → Agent 钱包

用户选择 Solana:
  USDC (SOL) 或 SOL → A2A Market 合约 → Agent 钱包
  程序: packages/solana-adapter/contracts/a2a_market.rs

未来跨链支付:
  用户在 Ethereum 付 USDC
  → LayerZero 跨链消息
  → X Layer 上的 PaymentHub 收款
  → Agent 执行完成后，原链退款或继续转账
```

---

## 5. 安全设计

### 5.1 重放攻击防护

```
每个 A2A 支付请求包含:
  • expires: 支付证明有效期（60秒）
  • nonce: 唯一随机数
  • from + to + amount 精确匹配

Specialist 验证:
  1. blockNumber 在 expires 内
  2. txHash 在链上存在且确认
  3. to 地址是自己的 Specialist 钱包
  4. amount 与报价一致
  5. nonce 未被使用过（防重放）
```

### 5.2 资金安全

```
PaymentHub 托管:
  • 用户资金不直接给 Worker
  • 任务失败自动退款
  • 多签（未来）控制合约升级

A2A 直接转账风险:
  • 子私钥泄露 → 用 OWS 解决（Phase 2）
  • 转账金额有上限（Policy Engine 限制）
  • Worker 钱包只持有小额流动资金
```

### 5.3 最终一致性

```
场景: 付款成功，但 Specialist 执行失败

当前处理:
  • Orchestrator 记录 paymentTxHash
  • 在 Agent 回复中提示"支付已完成但执行失败"
  • 用户可要求 Specialist 重试（已收款）

未来处理:
  • 条件支付（Conditional Payment）：Specialist 先锁定，执行成功后释放
  • 类似 Lightning Network 的 HTLC 机制
```

---

## 6. 开发者集成指南

### 如何创建一个可收费的 Specialist Agent

```typescript
// 在你的 CF Worker 中

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.url.endsWith("/execute")) {
      // 1. 检查支付证明
      const paymentProof = request.headers.get("X-Payment-Proof");
      if (!paymentProof) {
        // 返回 402，告知调用方需要付款
        return new Response(JSON.stringify({
          error: "Payment required",
          payment: {
            chain: "eip155:195",
            token: USDC_ADDRESS,
            amount: "1500000", // 1.5 USDC
            recipient: MY_WALLET_ADDRESS,
          }
        }), {
          status: 402,
          headers: { "Content-Type": "application/json" }
        });
      }

      // 2. 验证支付
      const proof = JSON.parse(paymentProof);
      const isValid = await verifyPayment(proof);
      if (!isValid) {
        return new Response("Invalid payment proof", { status: 403 });
      }

      // 3. 执行服务
      const result = await executeService(await request.json());
      return Response.json({ result });
    }
  }
};

async function verifyPayment(proof: any): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const receipt = await provider.getTransactionReceipt(proof.txHash);
  return (
    receipt?.status === 1 &&
    receipt.to?.toLowerCase() === USDC_ADDRESS.toLowerCase()
    // 解析 Transfer 事件，验证 to = MY_WALLET_ADDRESS, amount = 1500000
  );
}
```

### 如何在 Orchestrator 中调用付费 Specialist

参见 `docs/implementation/03-a2a-protocol.md` 第 4 节：`call_price_agent` 和 `call_trade_agent` 工具的完整实现代码。
