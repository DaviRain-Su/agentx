# XAgent — 架构文档

> 当前版本：黑客松阶段（X Layer 截止 3/26，Solana 截止 3/27）
> 最后更新：2026-03-25

---

## 一、项目是什么

XAgent 是一个**去中心化 AI Agent 经济网络**。

核心主张：AI Agent 可以相互雇用、相互付费，每一笔支付都有链上 txHash 可验证。
底层链：X Layer Testnet（EVM 兼容，chainId=195）。
执行层：Cloudflare Workers（任何人都可以用我们的 SDK 部署自己的 Agent 节点）。

---

## 二、包结构

```
xagent/
├── packages/
│   ├── agent-sdk/              # 开发者 SDK ← 核心产品
│   ├── worker-cloudflare/      # XAgent 自己的 demo Worker（也是参考实现）
│   ├── shared-orchestrator/    # 工作流引擎（sequential/parallel/DAG）
│   ├── node-local/             # 本地节点（非 Cloudflare 环境运行）
│   └── solana-adapter/         # Solana 链适配（截止 3/27，开发中）
│
├── packages/xlayer-adapter/
│   └── frontend/               # Demo 前端（Next.js）
│
└── vendor/
    └── pi-worker/              # 第三方：Cloudflare Workers AI Agent 框架
        ├── pi-worker           # 文件工具（SQLite/R2/Memory）+ Agent class
        ├── pi-coding-agent-worker  # createAgentSession + 完整 session 管理
        └── pi-tui-worker       # TUI 渲染（暂不使用）
```

---

## 三、链上合约（X Layer Testnet）

所有合约已部署，地址固定：

| 合约 | 地址 | 功能 |
|---|---|---|
| TaskManager | `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686` | 任务创建、状态管理、步骤记录 |
| PaymentHub | `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60` | 支付结算、Escrow 管理 |
| AgentRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | ERC-8004 Agent 注册 |
| USDC (测试) | `0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e` | 支付代币 |

**Explorer**: https://www.oklink.com/x-layer-testnet

---

## 四、Agent 钱包派生机制

XAgent 使用**确定性钱包派生**，一个 masterKey 可以派生出多个 agent 钱包：

```
privateKey = keccak256(toUtf8Bytes(`${NODE_PRIVATE_KEY}:${agentName}`))
address    = new Wallet(privateKey).address
```

当前三个 demo agent：

| Agent 名称 | agentName 参数 | 职责 | 收费 |
|---|---|---|---|
| WorkflowOrchestrator | `"orchestrator"` | 协调整个流程，雇用下面两个 | 0.002 USDC |
| PriceOracleAgent | `"price-oracle"` | 从 Binance/CoinGecko 获取价格 | 0.001 USDC |
| TradeStrategyAgent | `"trade-strategy"` | 评估交易策略，返回 BUY/SELL/HOLD | 0.005 USDC |

---

## 五、核心流程：A2A 支付

A2A（Agent-to-Agent）是核心的支付协议。每次 agent 调用另一个 agent，必须先付款。

### 完整流程（使用 Cloudflare Workflow 保证原子性）

```
用户
  │  approve USDC (前端 MetaMask)
  │
  ▼
POST /api/a2a  →  创建 CF Workflow 实例  →  立即返回 { jobId }

前端轮询 GET /api/a2a/:jobId

Workflow 内部（每步失败自动重试，不重复执行已完成步骤）：

  step 1: validate
    - 检查 callerAddress、budget 有效性
    - 派生三个 agent 的钱包地址

  step 2: collect_budget          ← USDC transferFrom(user → orchestrator)
    - 收取用户预付款
    - 失败重试 2 次

  step 3: price_query             ← A2A: USDC transfer(orchestrator → price-oracle, 0.001)
    - 付给 PriceOracleAgent
    - 调用 Binance API 获取价格
    - 失败重试 3 次

  step 4: strategy (conditional)  ← A2A: USDC transfer(orchestrator → trade-strategy, 0.005)
    - 仅在条件满足时执行（threshold 判断）
    - 付给 TradeStrategyAgent
    - 返回 BUY/SELL/HOLD

  step 5: refund
    - 查询 orchestrator 剩余余额
    - 退还给用户
    - 失败重试 3 次

最终结果：{ payments: [...], 每笔都有 txHash + explorerUrl }
```

### 为什么用 CF Workflow 而不是普通 fetch handler

| 问题 | 普通 Worker | Cloudflare Workflow |
|---|---|---|
| Worker 在 step 3 崩溃 | 用户 USDC 已扣，无法退款 | 从 step 3 重新开始，step 2 不重复执行 |
| 执行超时（30s 限制） | 5 个链上交易超时 | 每步独立计时，无上限 |
| 状态保存 | 内存丢失 | 持久化，断点续跑 |

---

## 六、@xagent/agent-sdk

开发者用这个 SDK 把自己的 Agent 接入 XAgent 网络。

### 设计原则

- 基于 **pi-worker** 的工具模式（TypeBox schema + execute 函数）
- 工具可以直接传入 `createAgentSession({ customTools: [...] })`
- 不重新发明轮子，扩展 pi-worker 而非替代它

### 提供的工具

```typescript
import { createXAgentTools } from "@xagent/agent-sdk";

const tools = createXAgentTools({
  masterKey: env.NODE_PRIVATE_KEY,
  agentName: "my-agent",
  // rpcUrl 默认 X Layer Testnet
});

// tools 包含：
// - a2a_pay      → 向另一个 agent 付 USDC
// - get_price    → 获取实时加密货币价格
// - list_agents  → 查看链上注册的 agents
// - lookup_agent → 按 ID 或地址查询 agent 信息
// - create_task  → 链上提交任务
// - get_task     → 查询任务状态
// - list_tasks   → 列出我的任务
```

### 一键启动（推荐用法）

```typescript
import { createXAgentSession } from "@xagent/agent-sdk";
import { getSqliteStore } from "pi-worker";

// 在 Cloudflare Durable Object 里
const { session } = await createXAgentSession({
  sqliteStore: getSqliteStore(this.ctx.storage.sql), // pi-worker 文件系统
  masterKey: env.NODE_PRIVATE_KEY,
  agentName: "my-defi-agent",
  cfGatewayToken: env.CF_GATEWAY_TOKEN,
  cfAccountId: env.CF_ACCOUNT_ID,
  cfGatewayName: env.CF_GATEWAY_NAME,
});
// 得到一个带文件工具 + 支付工具的完整 agent session
```

---

## 七、worker-cloudflare 的定位

**这是 XAgent 自己运行的 demo Worker**，同时也是开发者的参考实现模板。

它不是"管理整个网络的中心"，它只是网络里的一个节点。

### 当前有效的 API 路由

| 方法 | 路径 | 功能 | 状态 |
|---|---|---|---|
| POST | `/api/a2a` | 启动 A2A 支付 Workflow | ✅ 可用 |
| GET | `/api/a2a/:jobId` | 查询 Workflow 进度 | ✅ 可用 |
| POST | `/api/a2a/simulate` | 模拟模式（不需要钱包） | ✅ 可用 |
| GET | `/api/agents` | 返回三个 agent 的钱包地址 | ✅ 可用 |
| POST | `/api/deploy` | 创建 AgentSession DO 实例 | ✅ 可用 |
| POST | `/agent/auth` | 钱包签名验证，获取 session token | ✅ 可用 |
| POST | `/agent/chat/:id` | 与 AgentSession 对话 | ✅ 可用 |
| POST | `/tasks/:id/confirm` | 人工审批（Human-in-the-Loop） | ✅ 可用 |
| GET | `/health` | 健康检查 | ✅ 可用 |

### AgentSession 是什么

AgentSession 是一个 **Cloudflare Durable Object**，内部运行 pi-worker Agent，具备：
- 持久化对话历史（SQLite）
- 文件读写工具
- A2A 支付工具（`call_price_agent`、`call_trade_agent`）
- 接入 CF AI Gateway（Workers AI / Claude / 其他）

**目标用户**：开发者（在构建/测试自己的 agent 时使用），不是普通终端用户。

### 已写但未接入的代码（技术债）

```
src/agents/RealAgent.ts          ← 旧版 AI agent，有 5 个 TS 错误，未被使用
src/agents/PriceMonitorAgent.ts  ← 旧版，未被 index.ts 调用
src/agents/ConditionAgent.ts     ← 同上
src/agents/TradeExecutorAgent.ts ← 同上
src/executors/TaskExecutor.ts    ← 写了完整逻辑，但没有触发它的 HTTP 路由
```

---

## 八、前端现状（xlayer-adapter/frontend）

### 页面清单

| 页面 | 路径 | 状态 | 说明 |
|---|---|---|---|
| Dashboard | `/` | ✅ 展示用 | 数据来自 mockService |
| Market | `/market` | ⚠️ 展示用 | Agent 列表 hardcode，Deploy 按钮是 mock |
| Workflows | `/workflows` | ✅ 基本可用 | 提交触发 A2A，有 Human-in-the-Loop 审批 |
| Tasks | `/tasks` | ⚠️ 展示用 | 从 mockService 读数据，不显示链上真实任务 |
| Teams | `/teams` | ❌ 跑不起来 | TeamRegistry 合约地址为零，未部署 |

### 关键环境变量

```bash
NEXT_PUBLIC_WORKER_URL=https://xagent-worker.davirain-yin.workers.dev
NEXT_PUBLIC_TASK_MANAGER_ADDRESS=0x39223444d2f9a4d6769e91aa7908CB22CA3A8686
NEXT_PUBLIC_PAYMENT_HUB_ADDRESS=0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60
NEXT_PUBLIC_USDC_ADDRESS=0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e
```

---

## 九、shared-orchestrator 的定位

提供**运行时无关的工作流引擎**，可以在 Cloudflare Worker 或本地 Node.js 里运行相同的工作流逻辑。

核心能力：
- `SequentialRunner` — 顺序执行步骤
- `ParallelRunner` — 并行执行
- `ConditionalRunner` — 条件分支
- `DAGBuilder` — 有向无环图调度
- `WorkflowEngine` — 统一入口
- `ExecutionNode` — 节点注册与心跳
- `CloudflareRuntime` / `NodeRuntime` — 运行时适配

**与 CF Workflow 的关系**：shared-orchestrator 是业务逻辑层（"执行什么"），CF Workflow 是基础设施层（"怎么保证不丢失"）。两者应该配合，而非替代。

---

## 十、待决策的问题

### P0 — 黑客松必须搞定的

1. **部署 Worker**：`wrangler deploy` + 设置 secrets（`NODE_PRIVATE_KEY`、`CF_GATEWAY_TOKEN`）
2. **前端 Tasks 页面接链上数据**：现在从 mockService 读，应该从 `GET /api/a2a/:jobId` 或 TaskManager 合约读
3. **Market 的 Deploy 按钮**：是直接跳转 Workflow 页面，还是真正触发 A2A 雇用流程？

### P1 — 架构层面需要讨论的

4. **Teams 功能的定位**：
   - 方案 A：砍掉，黑客松不做
   - 方案 B：简化为"多个 agent 的 workflow 模板"，不需要新合约

5. **AgentSession 的用户界面**：
   - 当前没有前端入口，只有 API
   - 是否需要一个"开发者控制台"页面来访问 AgentSession？
   - 还是这个功能留给第三方开发者自己集成？

6. **Market 的购买流程应该是什么**：
   - 现在：展示 agent → Deploy 按钮（mock）
   - 应该是：展示 agent → 付款（USDC A2A）→ 直接调用 agent 服务
   - 但"付款后能干什么"需要明确：是启动一个 workflow？还是获得一个 API key？

7. **TaskExecutor 的触发机制**：
   - 写了完整的 task 执行逻辑（读链上任务→执行→结算）
   - 但目前触发方式是 cron（每分钟）+ `initializeNode()`，实际上 `initializeNode` 依赖的链上注册流程未完整
   - 这条路要不要打通？还是 demo 只走 A2A Workflow 这条路？

### P2 — 后续产品方向

8. **开发者如何发布自己的 Agent 到 XAgent Market**：
   - 需要 AgentRegistry 的 `registerAgent` 流程
   - 需要 Market 前端支持从链上读取（而非 hardcode）
   - 需要确定 Agent 的"服务接口"规范

9. **收费模型**：
   - 目前：per-call（每次调用收固定费用）
   - 可能还需要：subscription（包月）、per-token（按用量）
   - 平台分成比例：当前设计是 Agent owner 70%、Platform 20%、Stakers 10%

---

## 十一、部署 checklist

### Worker 部署

```bash
cd packages/worker-cloudflare
npx wrangler secret put NODE_PRIVATE_KEY    # 主私钥，派生所有 agent 钱包
npx wrangler secret put CF_GATEWAY_TOKEN    # Cloudflare API Token
npx wrangler deploy
```

### 前端部署

```bash
cd packages/xlayer-adapter/frontend
# 设置 .env.local（见第八节）
npm run build
# 部署到 Vercel / Netlify
```

### 验证

```bash
curl https://xagent-worker.xxx.workers.dev/health
curl https://xagent-worker.xxx.workers.dev/api/agents
curl -X POST https://xagent-worker.xxx.workers.dev/api/a2a/simulate \
  -H "Content-Type: application/json" \
  -d '{"symbol":"ETH","budget":0.01}'
```
