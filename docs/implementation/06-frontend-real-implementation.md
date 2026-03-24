# 前端 Mock → 真实实现任务单

> 基于代码审计，列出所有 Mock 状态的具体位置和替换方案
> Codex 可直接照此实现，每个任务独立可并行执行

---

## 总览：Mock 严重程度分级

| 页面/文件 | Mock 程度 | Demo 影响 | 优先级 |
|-----------|----------|-----------|--------|
| `WorkflowSubmit.tsx` taskId | Bug | 严重，taskId 显示错误 | P0 |
| `tasks/page.tsx` 确认按钮 | 断开 | 严重，Human-in-loop 无法完成 | P0 |
| `market/page.tsx` | 完全 Mock | 高，Agent 市场不可信 | P1 |
| `page.tsx` Dashboard 统计 | 硬编码 | 中，数字不真实 | P1 |
| `teams/page.tsx` 聊天 | Mock 延迟 | 低，链上雇佣工作 | P2 |

---

## Task F0：修复 WorkflowSubmit.tsx 中的 taskId Bug

**文件**：`packages/xlayer-adapter/frontend/components/WorkflowSubmit.tsx`

**问题**：用 `receipt?.blockNumber` 作为 taskId，应从 `TaskCreated` 事件中提取。

**定位**：搜索 `blockNumber`，找到类似这样的代码：
```typescript
setTaskId(receipt?.blockNumber?.toString() || "unknown");
```

**替换为**：
```typescript
// 从 TaskCreated 事件提取真实 taskId
let extractedTaskId = "unknown";
if (receipt?.logs) {
  for (const log of receipt.logs) {
    try {
      const parsed = taskManager.interface.parseLog(log);
      if (parsed?.name === "TaskCreated") {
        extractedTaskId = parsed.args.taskId.toString();
        break;
      }
    } catch {
      // 跳过无法解析的 log（其他合约事件）
    }
  }
}
// 降级：如果事件提取失败，用 blockNumber
if (extractedTaskId === "unknown" && receipt?.blockNumber) {
  extractedTaskId = `block-${receipt.blockNumber}`;
}
setTaskId(extractedTaskId);
```

**验收**：提交工作流后，显示的 Task ID 是合约返回的整数（如 `42`），不是区块号（如 `8931027`）。

---

## Task F1：Tasks 页面确认按钮接入链上合约

**文件**：`packages/xlayer-adapter/frontend/app/tasks/page.tsx`

**问题**：点击"Confirm"按钮后，目前代码没有调用合约。需要调用：
```solidity
TaskManager.respondToConfirmation(confirmationId, true)
```

**定位**：搜索 `handleConfirm` 或 `confirm` 函数。

### 步骤 1：添加确认按钮的合约调用

找到类似这样的处理函数：
```typescript
const handleConfirm = async (taskId: string) => {
  // 目前可能是空的或模拟的
};
```

**替换为完整实现**：
```typescript
const handleConfirm = async (taskId: string, confirmationId: string) => {
  if (!window.ethereum) {
    alert("请先连接钱包");
    return;
  }
  setIsConfirming(true);
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const taskManager = new ethers.Contract(CONTRACTS.taskManager, TASK_MANAGER_ABI_FULL, signer);

    // 调用合约确认
    const tx = await taskManager.respondToConfirmation(confirmationId, true);
    setConfirmTxHash(tx.hash);
    await tx.wait(1);

    // 刷新任务列表
    await fetchChainTasks();
  } catch (err: any) {
    console.error("确认失败:", err);
    alert(`确认失败: ${err.message}`);
  } finally {
    setIsConfirming(false);
  }
};
```

### 步骤 2：补充 TASK_MANAGER_ABI_FULL（添加 respondToConfirmation）

在文件顶部或 `lib/contracts.ts` 中补充：
```typescript
// 添加到 TASK_MANAGER_ABI 数组中
{
  "inputs": [
    {"internalType": "bytes32", "name": "confirmationId", "type": "bytes32"},
    {"internalType": "bool", "name": "confirm", "type": "bool"}
  ],
  "name": "respondToConfirmation",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "inputs": [{"internalType": "bytes32", "name": "confirmationId", "type": "bytes32"}],
  "name": "getConfirmation",
  "outputs": [{
    "components": [
      {"internalType": "bytes32", "name": "id", "type": "bytes32"},
      {"internalType": "uint256", "name": "taskId", "type": "uint256"},
      {"internalType": "bytes32", "name": "stepId", "type": "bytes32"},
      {"internalType": "string", "name": "title", "type": "string"},
      {"internalType": "string", "name": "description", "type": "string"},
      {"internalType": "uint256", "name": "timeoutAt", "type": "uint256"},
      {"internalType": "bool", "name": "confirmed", "type": "bool"},
      {"internalType": "bool", "name": "responded", "type": "bool"}
    ],
    "internalType": "struct TaskManager.ConfirmationRequest",
    "name": "",
    "type": "tuple"
  }],
  "stateMutability": "view",
  "type": "function"
}
```

### 步骤 3：展示确认请求详情

当任务状态为 `pending_confirmation` 时，通过 `getConfirmation` 获取确认详情并显示：

```typescript
// 在加载任务时，如果状态是 pending_confirmation，获取确认信息
if (task.status === TaskStatus.PendingConfirmation) {
  // 从事件日志或已知的 confirmationId 获取确认信息
  // 可以通过查询链上事件来获取 confirmationId
  // 简化方案：直接在 UI 显示"等待你的确认"按钮，confirmationId 从 Worker 获取
}
```

**注意**：`confirmationId` 需要从链上事件中获取。简化方案：通过监听 `ConfirmationRequested` 事件获取最新的 confirmationId。

```typescript
// 获取最新的 ConfirmationRequested 事件
const filter = taskManager.filters.ConfirmationRequested(null, BigInt(taskId));
const events = await taskManager.queryFilter(filter, -100); // 最近100个区块
if (events.length > 0) {
  const latestEvent = events[events.length - 1] as any;
  setActiveConfirmationId(latestEvent.args.confirmationId);
}
```

**验收**：
- 任务处于 `PendingConfirmation` 状态时，出现"确认"按钮
- 点击确认后，MetaMask 弹出签名请求
- 签名后，任务状态变为 `Executing`

---

## Task F2：Agent Market 页面接入 AgentRegistry

**文件**：`packages/xlayer-adapter/frontend/app/market/page.tsx`

**问题**：整个页面使用 `MOCK_AGENTS` 硬编码数组，没有链上数据。

**目标**：从 8004 AgentRegistry 合约读取已注册的 Agent，叠加显示在 mock 数据之上。

### 步骤 1：添加 AgentRegistry ABI（追加到 `lib/contracts.ts`）

```typescript
// AgentRegistry 8004 ABI（简化版，根据实际合约调整）
export const AGENT_REGISTRY_8004_ABI = [
  {
    "inputs": [],
    "name": "getAgentCount",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "index", "type": "uint256"}],
    "name": "getAgentByIndex",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "agent", "type": "address"}],
    "name": "getAgentInfo",
    "outputs": [{
      "components": [
        {"internalType": "address", "name": "owner", "type": "address"},
        {"internalType": "string", "name": "name", "type": "string"},
        {"internalType": "string", "name": "endpoint", "type": "string"},
        {"internalType": "bool", "name": "active", "type": "bool"},
        {"internalType": "uint256", "name": "registeredAt", "type": "uint256"}
      ],
      "internalType": "struct AgentRegistry.AgentInfo",
      "name": "",
      "type": "tuple"
    }],
    "stateMutability": "view",
    "type": "function"
  }
];
```

**注意**：上面的 ABI 是推测的，需要根据实际部署的 8004 合约 ABI 调整。实际合约地址：`0x8004A818BFB912233c491871b3d84c89A494BD9e`

### 步骤 2：在 MarketPage 中添加链上 Agent 读取

在 `export default function MarketPage()` 内：

```typescript
const [chainAgents, setChainAgents] = useState<any[]>([]);
const [loadingChain, setLoadingChain] = useState(false);

useEffect(() => {
  async function loadChainAgents() {
    setLoadingChain(true);
    try {
      // 使用公共 RPC（不需要用户连接钱包）
      const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[0]);
      const registry = new ethers.Contract(
        CONTRACTS.agentRegistry8004,
        AGENT_REGISTRY_8004_ABI,
        provider
      );

      let count: bigint;
      try {
        count = await registry.getAgentCount();
      } catch {
        // 合约可能方法名不同，降级处理
        console.warn("无法读取 Agent 数量，使用 mock 数据");
        return;
      }

      const agents = [];
      for (let i = 0n; i < count && i < 20n; i++) {
        try {
          const addr = await registry.getAgentByIndex(i);
          const info = await registry.getAgentInfo(addr);
          if (info.active) {
            agents.push({
              id: addr,
              name: info.name || `Agent ${addr.slice(0, 8)}`,
              description: `On-chain registered agent. Endpoint: ${info.endpoint || "N/A"}`,
              rating: 4.5, // 默认值，未来从声誉系统获取
              downloads: 0,
              price: 0,
              category: "On-Chain",
              badge: "🔗 Verified",
              registeredAt: new Date(Number(info.registeredAt) * 1000).toLocaleDateString(),
            });
          }
        } catch (err) {
          console.warn(`无法读取 Agent ${i}:`, err);
        }
      }
      setChainAgents(agents);
    } catch (err) {
      console.warn("AgentRegistry 读取失败，使用 mock 数据:", err);
    } finally {
      setLoadingChain(false);
    }
  }

  loadChainAgents();
}, []);
```

### 步骤 3：合并显示

找到使用 `MOCK_AGENTS` 渲染列表的地方：

```typescript
// 链上 Agent 优先，mock 数据补充
const allAgents = [...chainAgents, ...MOCK_AGENTS];
const filteredAgents = allAgents.filter((agent) => {
  const matchesCategory = activeCategory === "All" || agent.category === activeCategory;
  const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        agent.description.toLowerCase().includes(searchQuery.toLowerCase());
  return matchesCategory && matchesSearch;
});
```

### 步骤 4：部署按钮（现在先保留 mock 动画，未来接入真实部署）

部署功能先保留现有的 `setTimeout` 动画，但添加链上来源提示：

```typescript
const handleDeploy = async (agent: any) => {
  if (agent.badge === "🔗 Verified") {
    // 真实的链上 Agent — 显示终端链接
    window.open(`/agent?id=${agent.id}`, "_blank");
    return;
  }
  // Mock agent — 原有动画
  setDeployState("deploying");
  // ...原有代码
};
```

**验收**：
- 市场页面顶部显示链上注册的 Agent（带 🔗 Verified 标记）
- 下方显示 mock 的演示 Agent
- 如果 8004 合约没有注册的 Agent（空），只显示 mock 数据（优雅降级）
- 不报错，不白屏

---

## Task F3：Dashboard 首页统计接入链上数据

**文件**：`packages/xlayer-adapter/frontend/app/page.tsx`

**问题**：`STATS` 数组硬编码，数字不真实。

**目标**：展示链上真实的任务数、协议余额等数据。

**策略**：不删除 STATS，而是在加载时用真实数据替换。

### 在首页组件中添加

```typescript
import { ethers } from "ethers";
import { CONTRACTS, TASK_MANAGER_ABI, RPC_ENDPOINTS } from "@/lib/contracts";

// 在组件顶部添加 state
const [realStats, setRealStats] = useState<{
  totalTasks?: number;
  activeTasks?: number;
  walletAddress?: string;
} | null>(null);

useEffect(() => {
  async function fetchStats() {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[0]);
      const taskManager = new ethers.Contract(CONTRACTS.taskManager, TASK_MANAGER_ABI, provider);

      // 读取全局任务计数（nextTaskId - 1）
      const nextId: bigint = await taskManager.nextTaskId();
      const totalTasks = Number(nextId) - 1;

      // 如果钱包连接，读取当前用户的任务数
      let activeTasks = 0;
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method: "eth_accounts" }) as string[];
        if (accounts?.length) {
          const taskIds: bigint[] = await taskManager.getRequesterTasks(accounts[0]);
          activeTasks = taskIds.length;
        }
      }

      setRealStats({ totalTasks, activeTasks });
    } catch (err) {
      console.warn("统计数据读取失败，使用 mock:", err);
    }
  }

  fetchStats();
}, []);
```

### 在渲染 STATS 的地方用真实数据覆盖

找到渲染 STATS 的地方（通常是 `.map(stat => ...)`），在数值显示时：

```typescript
// 原来：直接显示 stat.value
// 改为：如果有真实数据则显示真实数据
const displayStats = STATS.map((stat, i) => ({
  ...stat,
  value: (() => {
    if (!realStats) return stat.value; // 加载中，显示 mock
    if (i === 0 && realStats.totalTasks !== undefined) {
      return `${realStats.totalTasks} Tasks on X Layer`;
    }
    if (i === 1 && realStats.activeTasks !== undefined) {
      return `${realStats.activeTasks} Your Tasks`;
    }
    return stat.value;
  })(),
}));
```

**验收**：
- 前两个统计数字反映链上真实数据
- 如果读取失败，显示 mock 数字（不报错）

---

## Task F4：Teams 聊天接入 Worker Agent

**文件**：`packages/xlayer-adapter/frontend/app/teams/page.tsx`

**问题**：雇佣团队后的聊天使用 `setTimeout` 模拟回复，未接入 Worker。

**目标**：雇佣成功后，打开与 AgentSession DO 的真实对话。

### 核心变化：雇佣成功后，建立 WebSocket 连接

找到 `handleHire` 或类似函数，在团队雇佣成功后：

```typescript
// 雇佣成功后，创建 AgentSession
const sessionId = `team-${teamId}-${Date.now()}`;

// 发送初始化消息（告知 Agent 它是哪个团队）
const initResponse = await fetch(
  `https://gradience-worker.<subdomain>.workers.dev/agent/chat/${sessionId}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `你是团队 "${teamName}" 的负责人 Agent。团队成员：${members.join(", ")}。请简短介绍你们能帮助用户做什么。`
    }),
  }
);
const initData = await initResponse.json();

// 显示 Agent 的真实回复（替代 setTimeout mock）
addMessage({ role: "assistant", content: initData.response });
setSessionId(sessionId);
```

### 后续消息发送

找到用户发送消息的 handler：

```typescript
const handleSendMessage = async (text: string) => {
  addMessage({ role: "user", content: text });
  setIsTyping(true);

  try {
    const response = await fetch(
      `https://gradience-worker.<subdomain>.workers.dev/agent/chat/${currentSessionId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      }
    );
    const data = await response.json();
    addMessage({ role: "assistant", content: data.response });
  } catch {
    addMessage({ role: "assistant", content: "Agent 暂时无法响应，请稍后重试。" });
  } finally {
    setIsTyping(false);
  }
};
```

**注意**：Worker URL 需要配置为环境变量：
```
# packages/xlayer-adapter/frontend/.env.local
NEXT_PUBLIC_WORKER_URL=https://gradience-worker.davirain-yin.workers.dev
```

**验收**：
- 雇佣团队后，聊天窗口显示 Agent 的真实回复（来自 Worker，有真实 AI 内容）
- 后续消息也得到 AI 回复
- 如果 Worker 不可用，显示友好的错误提示

---

## Task F5：mockService.ts 使用情况清理

**文件**：`packages/xlayer-adapter/frontend/lib/mockService.ts`

**首先确认是否还在使用**：

在前端目录搜索 `mockService` 的 import：
```bash
grep -r "mockService" packages/xlayer-adapter/frontend/app/
```

**如果没有 import**：这个文件是孤立的，直接删除（或保留作参考）。

**如果有 import**：找到对应的 page 文件，按照本文档其他 Task 的方式替换为真实实现。

---

## Task F6：补全 lib/contracts.ts（ABI 完整性）

**文件**：`packages/xlayer-adapter/frontend/lib/contracts.ts`

当前 TASK_MANAGER_ABI 缺少以下方法：

```typescript
// 追加到 TASK_MANAGER_ABI 数组
{
  "inputs": [
    {"internalType": "bytes32", "name": "confirmationId", "type": "bytes32"},
    {"internalType": "bool", "name": "confirm", "type": "bool"}
  ],
  "name": "respondToConfirmation",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
},
{
  "inputs": [{"internalType": "bytes32", "name": "confirmationId", "type": "bytes32"}],
  "name": "getConfirmation",
  "outputs": [{
    "components": [
      {"internalType": "bytes32", "name": "id", "type": "bytes32"},
      {"internalType": "uint256", "name": "taskId", "type": "uint256"},
      {"internalType": "bytes32", "name": "stepId", "type": "bytes32"},
      {"internalType": "string", "name": "title", "type": "string"},
      {"internalType": "string", "name": "description", "type": "string"},
      {"internalType": "uint256", "name": "timeoutAt", "type": "uint256"},
      {"internalType": "bool", "name": "confirmed", "type": "bool"},
      {"internalType": "bool", "name": "responded", "type": "bool"}
    ],
    "internalType": "struct TaskManager.ConfirmationRequest",
    "name": "",
    "type": "tuple"
  }],
  "stateMutability": "view",
  "type": "function"
},
{
  "inputs": [],
  "name": "nextTaskId",
  "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
  "stateMutability": "view",
  "type": "function"
},
// ConfirmationRequested 事件（用于前端监听）
{
  "anonymous": false,
  "inputs": [
    {"indexed": true, "internalType": "bytes32", "name": "confirmationId", "type": "bytes32"},
    {"indexed": true, "internalType": "uint256", "name": "taskId", "type": "uint256"},
    {"indexed": false, "internalType": "bytes32", "name": "stepId", "type": "bytes32"},
    {"indexed": false, "internalType": "uint256", "name": "timeoutAt", "type": "uint256"}
  ],
  "name": "ConfirmationRequested",
  "type": "event"
}
```

---

## 实现顺序和时间估算

```
立刻开始（P0，demo 关键路径）：
  F0: WorkflowSubmit taskId   → 30 分钟（改 5 行代码）
  F1: Tasks 确认按钮           → 1.5 小时（合约调用 + 事件查询）

并行进行（P1，让 demo 更可信）：
  F2: Market 接入 8004         → 1 小时（新增 useEffect + 数据合并）
  F3: Dashboard 真实统计       → 30 分钟（读取 nextTaskId）

之后处理（P2，polish）：
  F4: Teams 聊天接 Worker      → 1 小时（WebSocket 或 REST）
  F5: mockService 清理         → 15 分钟（删除文件）
  F6: ABI 补全                 → 20 分钟（追加方法）
```

---

## 常见陷阱

1. **`nextTaskId` 可能不在 ABI 里**：TaskManager 合约中 `nextTaskId` 是 `public` 状态变量，自动生成 getter，ABI 中是 `{"name": "nextTaskId", "stateMutability": "view", "type": "function"}`

2. **事件查询需要 Archive 节点**：`queryFilter` 查历史事件需要 Archive RPC。X Layer testnet RPC (`https://xlayertestrpc.okx.com`) 可能有限制。备选方案：只查最近 500 个区块

3. **用户没有 USDC**：确认按钮是 `nonpayable`，不花 gas 以外的费用，但 Worker 执行 A2A 支付时需要 USDC。确保 Demo 钱包有足够的 testnet USDC

4. **Worker URL 硬编码问题**：所有 fetch Worker 的地方，使用 `process.env.NEXT_PUBLIC_WORKER_URL` 而不是硬编码 URL

5. **CORS**：Worker 已配置 `Access-Control-Allow-Origin: *`，前端直接 fetch 不需要额外配置
