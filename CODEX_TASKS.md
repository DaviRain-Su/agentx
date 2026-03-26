# AgentX — Codex 任务主文档

> **这是唯一的任务追踪文档。** 所有 TODO、Plan、Sprint 任务统一在此。
> 状态：🔥 进行中 | ✅ 完成 | ⏳ 待做 | ❌ 阻塞
>
> 最后更新：2026-03-25

---

## 产品定位（Codex 执行前必读）

**AgentX 是什么：**
去中心化 AI Agent 经济网络。核心主张：AI Agent 之间存在**真实的经济关系**——每次 Agent 雇用另一个 Agent 都有链上 USDC 转账（txHash 可验证），而非普通函数调用。

**核心叙事（黑客松 Pitch）：**
> "你的量化策略值钱但不能开源。AgentX 让你把它变成一个 Agent 节点，在本地运行，通过 x402 自动收费，代码永远不离开你的机器。"

**与 LangChain/AutoGen 的差异：**
- 他们：同进程函数调用，无经济激励
- 我们：跨节点 USDC 支付，每笔有 txHash，Agent 之间有真实经济关系

**链上合约（已部署，地址固定）：**
| 合约 | 地址 |
|------|------|
| TaskManager | `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686` |
| PaymentHub | `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60` |
| AgentRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| USDC (测试) | `0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e` |

**Worker URL（已部署后）：** `https://agentx-worker.davirain-yin.workers.dev`

---

## 已完成清单（不要重复做）

| 功能 | 文件 | 状态 |
|------|------|------|
| A2A 原子支付 Workflow（5步，带重试） | `packages/worker-cloudflare/src/workflows/A2APaymentWorkflow.ts` | ✅ |
| Worker 路由：/api/a2a, /api/a2a/:jobId, /api/agents, /api/deploy | `packages/worker-cloudflare/src/index.ts` | ✅ |
| AgentSession Durable Object（真实 AI 对话，直接 fetch CF AI Gateway） | `packages/worker-cloudflare/src/agents/AgentSession.ts` | ✅ |
| Worker 部署上线 | `https://agentx-worker.davirain-yin.workers.dev` | ✅ |
| Tasks 页面接 TaskManager 链上数据 + A2A 轮询 | `packages/xlayer-adapter/frontend/app/tasks/page.tsx` | ✅ |
| Workflows 页面提交后写 localStorage jobId | `packages/xlayer-adapter/frontend/app/workflows/page.tsx` | ✅ |
| Teams 页面接真实 AgentSession（删掉 TeamRegistry 合约调用） | `packages/xlayer-adapter/frontend/app/teams/page.tsx` | ✅ |
| Market Deploy 按钮跳 Workflows | `packages/xlayer-adapter/frontend/app/market/page.tsx` | ✅ |
| agent-sdk：createAgentXTools（7个工具）+ createAgentXSession | `packages/agent-sdk/src/` | ✅ |
| 架构文档 | `docs/ARCHITECTURE.md`, `docs/AGENT_ECONOMY.md` | ✅ |
| Human-in-the-Loop 确认流程 | Worker `/tasks/:id/confirm` + Tasks 页面 UI | ✅ |

---

## 待办任务（按优先级排序）

### P0 — 黑客松截止前必须完成（3/26）

---

#### 任务 0：Worker 部署（人工操作，非 Codex）

**状态：✅ 完成（2026-03-25 11:51）**

Worker URL：`https://agentx-worker.davirain-yin.workers.dev`
Version ID：`84eefbe2-4ee7-4cb5-b29e-cd84d6a377eb`

**注意：** 部署前修复了 `AgentSession.ts` — 移除了 `pi-coding-agent-worker` 的 `AuthStorage`/`ModelRegistry` 依赖（这两个类使用 Node.js `fs` 模块，CF Workers 不支持），改为直接 fetch CF AI Gateway + 自实现 tool loop。功能等价，运行更稳定。

**⚠️ 还需要设置 secrets（否则 A2A 支付和 AI 对话无法工作）：**
```bash
cd packages/worker-cloudflare
npx wrangler secret put NODE_PRIVATE_KEY   # 以太坊私钥，派生所有 agent 钱包
npx wrangler secret put CF_GATEWAY_TOKEN  # Cloudflare API Token，AI Gateway 鉴权
```

---

#### 任务 1：Market 页面接 AgentRegistry 链上数据

**背景：** Market 页面现在是 MOCK_AGENTS 硬编码。演示时评委会问"新 agent 怎么出现在 Market"，答不上来。

**目标：** Market 页面从 AgentRegistry 合约（`0x8004A818BFB912233c491871b3d84c89A494BD9e`）读取真实注册的 agent 列表，同时保留 hardcode 的 demo agents 作为 fallback。

**文件：**
- 修改：`packages/xlayer-adapter/frontend/app/market/page.tsx`
- 参考 ABI：`packages/xlayer-adapter/frontend/lib/contracts.ts`（查看是否有 AgentRegistry ABI）

**实现步骤：**

1. 在 `market/page.tsx` 顶部 import useWeb3（已有），并从中获取 provider
2. 添加 AgentRegistry 的最小 ABI（只需要这两个方法）：
```typescript
const AGENT_REGISTRY_ABI = [
  "function getAgent(uint256 agentId) view returns (tuple(uint256 id, address owner, string name, string metadataURI, string[] capabilities, uint8 status, uint256 registeredAt))",
  "function agentCount() view returns (uint256)",
];
const AGENT_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
```

3. 添加 `useEffect` 从链上读取 agents：
```typescript
const [chainAgents, setChainAgents] = useState<any[]>([]);

useEffect(() => {
  if (!provider) return; // provider 来自 useWeb3()
  const registry = new ethers.Contract(AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI, provider);
  registry.agentCount().then(async (count: bigint) => {
    const agents = [];
    for (let i = 1; i <= Number(count); i++) {
      try {
        const a = await registry.getAgent(i);
        agents.push({
          id: i.toString(),
          name: a.name,
          description: a.metadataURI, // 先用 metadataURI 显示，后续可解析 JSON
          category: a.capabilities[0] || "AI",
          rating: 4.5,
          downloads: 0,
          price: 0.01,
          featured: false,
        });
      } catch { /* skip */ }
    }
    setChainAgents(agents);
  }).catch(console.error);
}, [provider]);
```

4. 渲染时合并：`const allAgents = [...MOCK_AGENTS, ...chainAgents];`，filteredAgents 基于 allAgents 过滤

**验收：**
- 连接钱包后，Market 页面底部出现"来自链上"的 agents（即使只有 0 个，也说明接通了）
- 如果 AgentRegistry 有注册的 agent，能显示出来

**状态：⏳ 待实现**

---

#### 任务 2：端到端演示流程验证

**背景：** 前端代码改完了，但没有做过真实的端到端测试。需要在部署 Worker 后验证完整路径。

**验证路径（按顺序执行）：**

```
步骤 1: 打开前端 → 连接 OKX/MetaMask（X Layer 测试网 chainId=195）
步骤 2: Workflows 页面 → 选"ETH Price Alert & Buy" → Run Workflow
         期望：弹出 MetaMask approve USDC → 签名 → 页面显示"Task created! ID: xxx"
               同时看到"A2A payment workflow started"提示
步骤 3: Tasks 页面 → 看到两个区域：
         - "A2A Payment Workflows"：显示刚才的 job，状态 running→completed
         - "All Tasks"：显示链上 TaskManager 任务
步骤 4: 点击 A2A job → 展开支付链时间线，看到每笔 txHash → 点击跳 OKLink 验证
步骤 5: Teams 页面 → 选"DeFi Alpha Team" → Hire Team
         期望：按钮变"启动中…" → 变"Active ✓" → 聊天框出现欢迎消息
步骤 6: 在聊天框输入"ETH 现在价格多少" → 等待 AI 真实回复
步骤 7: Market 页面 → 点"Try This Agent" → 跳转到 Workflows 页面
```

**如果步骤 2 失败（USDC approve 报错）：**
- 检查测试网 USDC 余额：`0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e`
- 检查 Worker 是否已部署（先做任务 0）

**如果步骤 5 失败（AI 不回复）：**
- 检查 Worker 的 CF_GATEWAY_TOKEN 是否设置
- 检查 AI_GATEWAY_MODEL 配置

**状态：⏳ 待执行（依赖任务 0 部署 Worker）**

---

### P1 — 提升演示质量（如果有时间）

---

#### 任务 3：本地 Agent 示例（node-local 私有策略模板）

**背景：** "私有量化策略"叙事的落脚点。演示"开发者在本地运行自己的策略，通过网络接受付款"。

**目标：** 在 `examples/private-strategy-agent/` 创建一个可运行的最小示例，展示：
1. 本地运行一个"量化策略" Agent（假策略，但结构真实）
2. 注册到 AgentRegistry（让别人能发现它）
3. 通过 x402/USDC 接收付款
4. 调用者可以通过 list_agents 发现并付费调用

**文件需要创建：**
```
examples/private-strategy-agent/
├── README.md          # 如何运行这个示例
├── package.json       # 依赖
├── src/
│   ├── index.ts       # 入口：注册 + 监听付款
│   ├── strategy.ts    # 假量化策略（只返回 BUY/SELL/HOLD）
│   └── server.ts      # HTTP 服务（接收 x402 调用）
└── .env.example       # NODE_PRIVATE_KEY, AGENT_NAME 等
```

**index.ts 核心逻辑：**
```typescript
import { createAgentXTools, AgentRegistryService, deriveAgentAddress } from "@agentx/agent-sdk";
import { ethers } from "ethers";

const masterKey = process.env.NODE_PRIVATE_KEY!;
const agentName = process.env.AGENT_NAME || "my-strategy-agent";

// 1. 派生我自己的钱包
const myAddress = deriveAgentAddress(masterKey, agentName);
console.log(`My agent wallet: ${myAddress}`);

// 2. 注册到 AgentRegistry（如果还没注册）
const provider = new ethers.JsonRpcProvider("https://xlayertestrpc.okx.com");
const wallet = new ethers.Wallet(
  ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`)),
  provider
);
const registry = new AgentRegistryService(provider);
await registry.registerAgent(
  { name: agentName, capabilities: ["trade_strategy", "price_analysis"] },
  wallet,
  "https://my-agent.example.com/metadata.json"
);

// 3. 监听传入的 USDC 付款，付款后返回策略结果
// （见 server.ts）
```

**状态：⏳ 待实现**

---

#### 任务 4：Dashboard 首页接真实数据

**背景：** Dashboard 首页展示"网络总 agents、总任务、总支付量"，目前是 mockService。

**目标：** 从链上 + Worker API 读取真实数字。

**文件：** `packages/xlayer-adapter/frontend/app/page.tsx`

**数据来源：**
| 指标 | 来源 |
|------|------|
| 网络 Agents 数量 | `AgentRegistry.agentCount()` |
| 我的任务数量 | `TaskManager.getRequesterTasks(address).length` |
| Worker 在线状态 | `GET /health` |
| A2A 支付总数 | localStorage["a2a_jobs"].length（本地估算） |

**实现：** 在 page.tsx 里用 useEffect 并行获取这 4 个数据，更新显示的统计卡片。

**状态：⏳ 待实现（优先级低于任务 1、2、3）**

---

### P2 — 黑客松后续开发

---

#### 任务 5：Active 模式（Agent 主动抢单）

**背景：** 当前是"用户找 Agent"的被动模式。Active 模式是 Agent 自己扫描市场任务并报价（类似滴滴司机抢单）。

**为什么是 P2：** 需要新的"任务广播"合约机制 + Agent 竞价逻辑 + 用户选标界面，工作量大。

**黑客松期间的简化展示方式：**
- Worker 的 `scheduled()` cron 每分钟执行，可以说"这就是 Agent 自动扫描任务的基础"
- Tasks 页面显示"Agent 自动接单了你的任务"文案

**完整实现需要：**
1. 新合约：TaskBroadcast（发布任务 + 接受报价）
2. Worker 的 cron 里添加：扫描新任务 → 评估能力 → 提交报价
3. 前端：任务发布界面 + 报价选择界面

**状态：⏳ 黑客松后实现**

---

#### 任务 6：Market 页面"发布我的 Agent"流程

**背景：** 开发者部署好自己的 Agent 后，需要把它发布到 Market 让别人发现。

**目标：** Market 页面右上角"Publish Agent"按钮实现真实流程：
1. 填写 Agent 名称、能力描述、收费标准
2. 调用 AgentRegistry.registerAgent()（需要签名）
3. 注册成功后 Agent 出现在 Market 列表

**文件：** `packages/xlayer-adapter/frontend/app/market/page.tsx`（现在按钮是 UI 存在但没功能）

**状态：⏳ 黑客松后实现**

---

#### 任务 7：Teams 多层嵌套（真正的 A2A 编排）

**背景：** 当前 Teams 聊天是单个 AgentSession。真正的多 Agent 编排应该是：Leader Agent 收到消息 → 拆分子任务 → A2A 付款给子 Agent → 汇总结果。

**实现方案（方案 C，复用已有能力）：**
- Leader Agent 工具里包含 `a2a_pay`，它可以向其他 Agent 付款
- 每次 A2A 付款产生 txHash
- Teams 聊天界面显示"工作流时间线"（把支付链展示成步骤）

**文件：** `packages/xlayer-adapter/frontend/app/teams/page.tsx`

**状态：⏳ 黑客松后实现**

---

## Codex 执行规范

### 每个任务的执行流程

```
1. 读完任务说明中的"文件"和"实现步骤"
2. 先读现有文件，理解上下文，再动手修改
3. 改完后运行：cd packages/xlayer-adapter/frontend && npx tsc --noEmit
4. 确保 0 TypeScript 错误后提交
5. 提交信息格式：feat: 任务X — [功能描述]
```

### 绝对禁止

- 不要删除或重写已完成的功能（见上方"已完成清单"）
- 不要引入新的 npm 包（除非任务明确要求）
- 不要改动合约地址
- 不要改动 Worker 的 wrangler.toml 绑定

### 验证命令

```bash
# TypeScript 检查
cd packages/xlayer-adapter/frontend && npx tsc --noEmit

# 前端构建
cd packages/xlayer-adapter/frontend && npm run build

# Worker 构建
cd packages/worker-cloudflare && npm run build

# Worker 部署
cd packages/worker-cloudflare && npx wrangler deploy
```

---

## 关键文档索引

| 文档 | 内容 |
|------|------|
| `docs/ARCHITECTURE.md` | 完整架构说明、包结构、API 路由 |
| `docs/AGENT_ECONOMY.md` | 主动/被动模式、定价模型、Teams 方案 |
| `docs/DEVELOPER_GUIDE.md` | 开发者接入教程（5分钟部署你的 Agent）|
| `DEPLOYMENT.md` | 合约地址、部署步骤 |

---

*上次更新：2026-03-25 | 执行负责人：Codex*
