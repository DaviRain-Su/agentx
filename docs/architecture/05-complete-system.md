# AgentX 完整系统架构

> 当前实现状态的真实架构图 — 包含已实现、未实现、Mock 三类标注

---

## 1. 全局架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           用户端（浏览器）                                         │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                  Next.js 前端  (packages/xlayer-adapter/frontend)        │   │
│  │                                                                         │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │   │
│  │  │Dashboard │  │Workflows │  │  Tasks   │  │  Teams   │  │ Market  │  │   │
│  │  │ ⚠️ Mock  │  │✅ 链上   │  │✅ 链上   │  │⚠️ 链上+  │  │❌ Mock  │  │   │
│  │  │  Stats   │  │  创建    │  │  读取    │  │  Mock聊天│  │  Only   │  │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘  │   │
│  │       │             │              │              │              │       │   │
│  │  ┌────▼─────────────▼──────────────▼──────────────▼──────────────▼────┐ │   │
│  │  │                       Web3 Layer (ethers.js)                       │ │   │
│  │  │  MetaMask / OKX Wallet    BrowserProvider    ContractFactory       │ │   │
│  │  └─────────────────────────────────┬─────────────────────────────────┘ │   │
│  └────────────────────────────────────│─────────────────────────────────────┘  │
└───────────────────────────────────────│─────────────────────────────────────────┘
                                        │  JSON-RPC
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      X Layer 区块链（测试网 chainId=195）                          │
│                                                                                 │
│  ┌──────────────────────┐  ┌────────────────────┐  ┌───────────────────────┐   │
│  │    TaskManager        │  │     PaymentHub      │  │  AgentRegistry (8004) │   │
│  │  0x39223444...        │  │  0x6FAeAD7A1...     │  │  0x8004A818...        │   │
│  │                      │  │                    │  │                       │   │
│  │  createTask()        │  │  createEscrow()    │  │  register()           │   │
│  │  startExecution()    │  │  release()         │  │  isRegistered()       │   │
│  │  recordStep()        │  │                    │  │  getAgent()           │   │
│  │  requestConfirm()    │  │  USDC              │  │                       │   │
│  │  respondConfirm()    │  │  0x67d0E8f4...     │  │  ❌ Worker 未调用注册   │   │
│  └──────────────────────┘  └────────────────────┘  └───────────────────────┘   │
│                                                                                 │
│  TeamRegistry              ConfirmationRequest        Events:                   │
│  (已部署，前端部分使用)        (链上等待用户签名)          TaskCreated              │
│                                                       TaskStatusChanged        │
│                                                       StepCompleted            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ▲
                          Cron触发/      │ ethers.js
                          HTTP轮询        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker  (packages/worker-cloudflare)               │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      index.ts (路由入口)                                  │   │
│  │                                                                         │   │
│  │  GET  /health            POST /agent/auth       GET  /agent/info        │   │
│  │  POST /agent/chat/:id    GET  /agent/history/:id WS  /agent/ws/:id     │   │
│  │  POST /sessions/:id/chat  (DO proxy)                                    │   │
│  └─────────────────┬───────────────────────────────────────────────────────┘   │
│                    │                                                            │
│         ┌──────────▼──────────┐         ┌──────────────────────────────────┐   │
│         │   TaskExecutor      │         │   AgentSession (Durable Object)  │   │
│         │   (Cron 触发)       │         │   (每个会话一个 DO 实例)            │   │
│         │                    │         │                                   │   │
│         │  1. 读取待执行任务   │         │  ✅ SQLite 持久化对话历史          │   │
│         │  2. fetchWorkflow   │         │  ✅ WebSocket 实时通信             │   │
│         │  3. 执行工作流步骤   │         │  ✅ pi-worker Agent 集成           │   │
│         │  4. 记录链上结果    │         │  ✅ CF AI Gateway 模型路由          │   │
│         │  5. 触发人工审批    │         │                                   │   │
│         │  ❌ 未调 PaymentHub │         │  Tools:                          │   │
│         └──────┬─────────────┘         │  fetch_price (Binance)           │   │
│                │                       │  evaluate_condition               │   │
│         ┌──────▼─────────────┐         │  prepare_trade                   │   │
│         │   Agent 执行层      │         │  write/read/list_notes           │   │
│         │                    │         │  ❌ call_price_agent (未实现)      │   │
│         │ PriceMonitorAgent  │         │  ❌ call_trade_agent (未实现)      │   │
│         │ ✅ CoinGecko/Binance│         └──────────────────────────────────┘   │
│         │                    │                                                 │
│         │ ConditionAgent     │         ┌──────────────────────────────────┐    │
│         │ ✅ 真实条件评估      │         │   StateManager (KV 存储)          │    │
│         │                    │         │   ✅ 任务状态持久化               │    │
│         │ TradeExecutorAgent │         │   ✅ 分布式锁防并发               │    │
│         │ ⚠️ calldata 是 Mock│         │   ✅ 执行日志记录                 │    │
│         │                    │         └──────────────────────────────────┘    │
│         │ AIAgent            │                                                 │
│         │ ✅ CF Workers AI   │         ┌──────────────────────────────────┐    │
│         │ ⚠️ 模型硬编码       │         │   HumanLoopService               │    │
│         └────────────────────┘         │   ✅ 轮询链上 ConfirmationRequest │    │
│                                        │   ✅ 超时处理                     │    │
│                                        └──────────────────────────────────┘    │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                     WorkflowService (存储抽象)                             │  │
│  │  支持: Arweave | IPFS | xurl:// | agentx:// | 内联 JSON              │  │
│  │  ✅ DAG 依赖解析  ✅ 步骤变量替换  ✅ Mock 降级                            │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  环境变量 (wrangler.toml + secrets):                                             │
│  CF_ACCOUNT_ID / CF_GATEWAY_NAME / CF_GATEWAY_TOKEN / AI_GATEWAY_MODEL        │
│  NODE_PRIVATE_KEY / XLAYER_RPC_URL / XLAYER_CHAIN_ID / DEMO_MODE              │
│  Bindings: AI, AGENTX_KV, AGENT_SESSIONS (DO)                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                    │                              │
         ┌──────────▼──────┐           ┌───────────▼──────────┐
         │  CF AI Gateway  │           │   外部 API            │
         │  + Workers AI   │           │                      │
         │                 │           │  Binance 价格 API    │
         │  llama-3.3-70b  │           │  CoinGecko API       │
         │  (可切换模型)    │           │  (可选 API Key)      │
         └─────────────────┘           └──────────────────────┘
```

---

## 2. 数据流：用户提交工作流到执行完成

```
用户 (MetaMask)
  │
  │  1. 选择工作流模板（硬编码在前端）
  │
  ▼
WorkflowSubmit.tsx
  │
  │  2. USDC.approve(PaymentHub, budget)
  │  3. TaskManager.createTask(workflowHash, agentDIDs[], budget)
  │     → 链上事件: TaskCreated(taskId, requester, workflowHash, budget)
  │  4. 从事件提取 taskId ← ⚠️ 当前用 blockNumber，需修复
  │
  ▼
X Layer 链上
  │
  │  5. Cron（每分钟）或手动触发 Worker
  │
  ▼
TaskExecutor.execute(taskId)
  │
  │  6. 获取分布式锁（KV）
  │  7. 从 TaskManager.getTask(taskId) 读取状态
  │  8. WorkflowService.fetchWorkflow(workflowHash)
  │     → Arweave / IPFS / xurl / Mock 降级
  │
  │  9. 拓扑排序工作流步骤
  │
  ├─ 步骤1: PriceMonitorAgent
  │     → Binance API: GET /api/v3/ticker/price?symbol=ETHUSDT
  │     → 结果写入 StateManager (KV)
  │
  ├─ 步骤2: ConditionAgent
  │     → 从 StateManager 读取步骤1输出（价格）
  │     → 评估条件 "price > 2800"
  │
  ├─ 步骤3: HumanLoopService（如果条件为 true）
  │     → TaskManager.requestConfirmation(taskId, stepId, title, desc, timeout)
  │     → 链上事件: ConfirmationRequested(...)
  │     ← 前端 tasks/page.tsx 轮询，显示"等待确认"状态
  │     ← 用户 MetaMask 签名: TaskManager.respondToConfirmation(confirmId, true)
  │     → 继续执行
  │
  ├─ 步骤4: TradeExecutorAgent
  │     → ⚠️ 目前返回 Mock calldata
  │     → 应该：查询 DEX router 合约，编码真实 swap calldata
  │
  │  10. TaskManager.recordStepCompletion(taskId, stepId, status, outputHash, error)
  │      重复到所有步骤完成
  │
  │  11. ❌ 缺失：PaymentHub.createEscrow(taskId, breakdown[])
  │
  ▼
任务完成（链上状态 = Completed）
```

---

## 3. A2A 经济流（新增，当前未实现）

```
AgentSession DO (Orchestrator)
  │
  │  用户消息: "监控 ETH 价格，超过 $2800 准备买 0.1 ETH"
  │
  ├─ [LLM 决策：需要 Price Agent]
  │
  ├─ Tool: call_price_agent("ETH")          ← ❌ 尚未实现
  │     │
  │     │  a. Orchestrator 钱包 → Price Agent 钱包 转 1.5 USDC
  │     │     USDC.transfer(priceAgentAddress, 1_500_000)
  │     │     等待 X Layer 1 区块确认（~2 秒）
  │     │
  │     │  b. 付款确认后执行：Binance API 获取 ETH 价格
  │     │
  │     └─ 返回 { price: 2847, paymentTxHash: "0x..." }
  │
  ├─ [LLM 决策：价格 > 2800，需要 Trade Agent]
  │
  ├─ Tool: call_trade_agent("buy", "ETH", 2847, 2800, "0.1")  ← ❌ 尚未实现
  │     │
  │     │  a. Orchestrator 钱包 → Trade Agent 钱包 转 2.5 USDC
  │     │     等待确认
  │     │
  │     │  b. evaluate_condition + prepare_trade
  │     │
  │     └─ 返回 { conditionMet: true, trade: "BUY 0.1 ETH", paymentTxHash: "0x..." }
  │
  ├─ [Human-in-the-loop]
  │     TaskManager.requestConfirmation(...)
  │     用户 MetaMask 签名确认
  │
  └─ 任务完成 → PaymentHub.createEscrow(breakdown: [...])  ← ❌ 尚未实现

钱包余额变化（X Layer testnet 可验证）：
  Orchestrator wallet: -1.5 - 2.5 + 1.0 USDC  (总净支出 3 USDC，收 20%)
  Price Agent wallet:  +1.5 USDC               (收 30%)
  Trade Agent wallet:  +2.5 USDC               (收 50%)
```

---

## 4. 组件现状速查表

| 组件 | 位置 | 状态 | 说明 |
|------|------|------|------|
| **前端** | | | |
| Dashboard 统计 | `app/page.tsx` | ⚠️ Mock | 硬编码数字，需从链上读取 |
| Workflows 创建 | `app/workflows/page.tsx` | ✅ 真实 | 链上 createTask 工作 |
| WorkflowSubmit taskId | `components/WorkflowSubmit.tsx` | ⚠️ Bug | 用 blockNumber 代替事件提取 |
| Tasks 列表 | `app/tasks/page.tsx` | ✅ 真实 | 链上读取，需验证 |
| Tasks 确认按钮 | `app/tasks/page.tsx` | ❌ 断开 | 未调用合约 respondToConfirmation |
| Teams 雇佣 | `app/teams/page.tsx` | ✅ 链上 | 链上逻辑工作 |
| Teams 聊天 | `app/teams/page.tsx` | ⚠️ Mock | setTimeout 模拟，未接 Worker |
| Market 列表 | `app/market/page.tsx` | ❌ Mock | 完全硬编码，未接 registry |
| Market 部署 | `app/market/page.tsx` | ❌ Mock | setTimeout 模拟 |
| Agent Terminal | `app/agent/page.tsx` | ✅ 真实 | 接 Worker WebSocket |
| **Worker 后端** | | | |
| 路由入口 | `src/index.ts` | ✅ 真实 | 路由、auth、CORS 完整 |
| AgentSession DO | `src/agents/AgentSession.ts` | ✅ 真实 | pi-worker + SQLite |
| TaskExecutor | `src/executors/TaskExecutor.ts` | ✅ 真实 | 完整执行引擎 |
| PriceMonitorAgent | `src/agents/PriceMonitorAgent.ts` | ✅ 真实 | Binance + CoinGecko |
| ConditionAgent | `src/agents/ConditionAgent.ts` | ✅ 真实 | 真实条件评估 |
| TradeExecutorAgent | `src/agents/TradeExecutorAgent.ts` | ⚠️ Mock | calldata 是假的 |
| AIAgent | `src/agents/AIAgent.ts` | ✅ 真实 | CF Workers AI |
| WorkflowService | `src/services/WorkflowService.ts` | ✅ 真实 | 多源存储 |
| StateManager | `src/services/StateManager.ts` | ✅ 真实 | KV 持久化 |
| HumanLoopService | `src/services/HumanLoopService.ts` | ✅ 真实 | 链上轮询 |
| PaymentHub 结算 | — | ❌ 缺失 | 未实现 |
| A2A 工具 | — | ❌ 缺失 | call_price_agent 等未实现 |
| **合约** | | | |
| TaskManager | X Layer 0x39223444 | ✅ 已部署 | 完整功能 |
| PaymentHub | X Layer 0x6FAeAD7A1 | ✅ 已部署 | createEscrow 可用 |
| AgentRegistry 8004 | X Layer 0x8004A818 | ✅ 已部署 | 未从 Worker 调用注册 |
| TeamRegistry | X Layer | ✅ 已部署 | 前端部分使用 |
| USDC | X Layer 0x67d0E8f4 | ✅ 已部署 | 标准 ERC20 |

---

## 5. 关键接口契约

### 5.1 Worker API 端点（完整）

```
基础 URL: https://agentx-worker.<subdomain>.workers.dev

GET  /health
  → { status: "ok", version: "0.1.0", model: "...", nodeId: "..." }

POST /agent/auth
  Body: { taskId: string, signature: string, message: string }
  → { token: string }  (JWT or session token)

POST /agent/chat/:sessionId
  Headers: Authorization: Bearer <token>
  Body: { message: string }
  → { response: string }

GET  /agent/history/:sessionId
  → { history: [{ role, content, ts }] }

POST /agent/clear/:sessionId
  → { ok: true }

GET  /agent/info/:sessionId
  → { model: string, gateway: string, messages: number }

WS   /agent/ws/:sessionId
  Client → { type: "message", content: string }
  Client → { type: "ping" }
  Client → { type: "clear" }
  Server → { type: "start" }
  Server → { type: "delta", content: string }
  Server → { type: "end" }
  Server → { type: "pong" }
  Server → { type: "error", content: string }
```

### 5.2 AgentSession DO 内部端点

```
同上，但通过 AGENT_SESSIONS.get(id).fetch(request) 代理。

POST /chat    Body: { message: string }  → { response: string }
GET  /history  → { history: [...] }
POST /clear    → { ok: true }
GET  /info     → { model, gateway, messages }
WS   /ws       (参见上方 WebSocket 协议)
```

### 5.3 X Layer 合约接口（关键方法）

```solidity
// TaskManager
createTask(bytes32 workflowHash, bytes32[] agentDIDs, uint256 totalBudget) → uint256 taskId
getTask(uint256 taskId) → Task { id, requester, workflowHash, agentDIDs, totalBudget, status, ... }
getRequesterTasks(address requester) → uint256[]
requestConfirmation(uint256 taskId, bytes32 stepId, string title, string desc, uint256 timeoutSec) → bytes32
respondToConfirmation(bytes32 confirmationId, bool confirm)
recordStepCompletion(uint256 taskId, bytes32 stepId, uint8 status, bytes32 outputHash, string error)

// PaymentHub
createEscrow(uint256 taskId, uint256 amount, PaymentBreakdown[] breakdown) → bytes32
struct PaymentBreakdown { address agentOwner; uint256 amount; string description; }

// USDC (ERC20)
approve(address spender, uint256 amount) → bool
transfer(address to, uint256 amount) → bool
balanceOf(address account) → uint256
```

---

## 6. 部署架构

```
互联网用户
    │
    ▼
Cloudflare Edge (全球 CDN)
    │
    ├── 静态资源 / Next.js SSG → Vercel 或 CF Pages
    │    packages/xlayer-adapter/frontend/
    │
    └── API / DO 路由 → Cloudflare Workers
         packages/worker-cloudflare/
         │
         ├── Worker 实例（无状态，按需扩展）
         │    处理 HTTP 路由、auth、任务轮询
         │
         ├── Durable Objects（有状态，每会话一个）
         │    AgentSession DO → SQLite 存储对话
         │
         └── KV Namespace: AGENTX_KV
              任务状态、分布式锁、日志
```

---

## 7. Solana 侧架构（待实现，截止 3/27）

```
packages/solana-adapter/
├── frontend/      ← 目前为空，需新建 Next.js 项目
└── contracts/
    ├── a2a_market.rs      ← Agent marketplace 合约（已写）
    └── agent_registry.rs  ← Agent 注册合约（已写）

目标：
┌─────────────────────────────────────────────────┐
│           Solana 前端（最小可行版）               │
│                                                 │
│  1. Phantom 钱包连接                             │
│  2. A2A Market 浏览（读取 a2a_market 合约）       │
│  3. Agent Registry 查看                         │
│  4. 复用 xlayer 前端的 DashboardLayout/样式      │
└─────────────────────────────────────────────────┘

跨链身份：
  同一个 Agent 在 EVM (8004) + Solana (a2a_market) 都注册
  声誉聚合 = 两链历史记录的综合评分
```

---

## 8. 未来演进路径

```
当前（黑客松 Demo）
  Worker 子私钥派生 + 固定比例 A2A
  Mock calldata + 硬编码模板
  链上基础功能可运行

      ↓ Phase 2

生产 MVP（黑客松后 1-2 个月）
  OWS 钱包标准集成
  真实 DEX swap calldata（X Layer DEX）
  HTTP 402 协议标准化
  Workflow 存储到 Arweave
  Agent 在 8004 自动注册

      ↓ Phase 3

协议网络（长期）
  完全 P2P Agent 发现
  跨链声誉聚合（EVM + Solana）
  代币经济 / 质押
  DAO 治理
```
