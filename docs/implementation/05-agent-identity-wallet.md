# Agent 身份与钱包体系

> 现状（Demo 级）和未来（生产级）的对比规划

---

## 1. 三层身份体系

```
层 1：声誉身份（链上，跨链可验证）
      ├─ EVM 链：8004 Agent Registry (0x8004A818...)
      └─ Solana：A2A Market 合约（见 packages/solana-adapter）

层 2：执行钱包（签名，支付，收款）
      ├─ Demo：HD 子钱包（从 NODE_PRIVATE_KEY 派生）
      └─ 未来：Open Wallet Standard (OWS) 本地 daemon

层 3：访问控制（谁可以调用这个 Agent）
      ├─ Demo：CF API token + DEMO_MODE bypass
      └─ 未来：OWS API key + policy engine（链限制、金额上限、过期时间）
```

---

## 2. 现在（Demo）：子钱包派生

### 派生规则

```
NODE_PRIVATE_KEY (master)
  ├─ 直接使用            → Orchestrator Agent 钱包
  ├─ keccak256(key + ":price-agent")  → Price Agent 钱包
  └─ keccak256(key + ":trade-agent")  → Trade Agent 钱包
```

### 代码（已在 03-a2a-protocol.md 中定义）

```typescript
function deriveAgentWallet(masterKey: string, agentName: string): ethers.Wallet {
  const derivedKey = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
  return new ethers.Wallet(derivedKey);
}
```

### 已知问题（Demo 可接受，生产必须改）

- 子私钥可从主私钥反推（数学上不安全）
- 未在 8004 registry 注册（链上没有身份证明）
- 没有访问控制策略（没有金额上限）

---

## 3. 未来（生产）：OWS 集成

**[Open Wallet Standard](https://docs.openwallet.sh)** 是专为 Agent 钱包设计的开放标准，支持：
- 一个 wallet，同时生成所有链的地址（EVM + Solana + Bitcoin 等）
- Policy engine：限制 Agent 只能在特定链、金额范围内签名
- API key 访问：Agent 拿 `ows_key_...` token 签名，永远不接触私钥
- HTTP 402 自动处理：OWS CLI 遇到 402 响应自动完成支付

### 与我们架构的对应关系

| 我们现在 | OWS 未来方案 |
|---------|-------------|
| NODE_PRIVATE_KEY 硬编码在 wrangler secret | OWS daemon 运行在 VPS，CF Worker 通过 REST 调用 |
| keccak256 派生子私钥 | `ows wallet create --name "price-agent"` 多链地址 |
| 无访问控制 | OWS Policy：`allowed_chains: ["eip155:195"]`，`max_amount: 5 USDC` |
| 手动 USDC transfer | `ows pay request` 自动处理 402 |

### 集成路径（黑客松后）

```
Phase 1 (现在)：
CF Worker → 直接用 ethers + 子私钥

Phase 2 (下一个版本)：
CF Worker → HTTP → OWS REST API → 本地 daemon 签名
                                  ↓
                             OWS policy engine 鉴权

Phase 3 (生产)：
CF Worker → OWS SDK → 策略控制的多链签名
Agent 有 ows_key_xxx token，不接触私钥
Agent 调用其他 Agent 时自动走 HTTP 402 协议
```

---

## 4. 8004 身份注册（Demo 跳过，下一版本实现）

### 什么是 8004

ERC-8004 是 Agent 身份的链上标准。已部署合约：`0x8004A818BFB912233c491871b3d84c89A494BD9e`

### 未来：Agent 创建时自动注册

```typescript
// Agent DO 首次启动时（constructor 或 第一次 fetch）
async function registerAgentIdentity(agentName: string, walletAddress: string, env: Env) {
  const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
  const wallet = new ethers.Wallet(env.NODE_PRIVATE_KEY, provider);
  const registry = new ethers.Contract(AGENT_REGISTRY_8004, AGENT_REGISTRY_ABI, wallet);

  // 链上注册（如果还未注册）
  const isRegistered = await registry.isRegistered(walletAddress);
  if (!isRegistered) {
    const tx = await registry.register(walletAddress, {
      name: agentName,
      capabilities: ["price-feed", "trade-preparation"],
      endpoint: `https://gradience-worker.${env.CF_SUBDOMAIN}.workers.dev`,
    });
    await tx.wait(1);
    console.log(`[${agentName}] Registered on 8004 registry: ${tx.hash}`);
  }
}
```

---

## 5. Solana 身份（用于 Solana 黑客松）

Solana 侧的 A2A Market 合约（`packages/solana-adapter`）也有 Agent registry。

跨链身份的核心想法：同一个 Agent，在 EVM 上用 8004 注册，在 Solana 上用 A2A Market 注册。声誉数据通过两个链上的历史记录聚合。

实现顺序：先 EVM（X Layer 截止 3/26），再 Solana（截止 3/27）。
