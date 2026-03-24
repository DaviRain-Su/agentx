# Demo 实现任务单

> Codex/ChatGPT 实现指南 — 精确到文件和行号，无需额外理解背景
>
> **黑客松截止：2026-03-26（X Layer）**
> **当前时间：2026-03-25**

---

## 前置条件

实现者需要了解的最小背景：
- 项目是 Cloudflare Worker + Durable Objects + Next.js 前端
- 合约已部署在 X Layer 测试网（地址见 `packages/xlayer-adapter/frontend/lib/contracts.ts`）
- Worker 代码在 `packages/worker-cloudflare/src/`
- 前端在 `packages/xlayer-adapter/frontend/`

---

## Task 1：修复 WorkflowSubmit.tsx 的 taskId 提取

**文件**：`packages/xlayer-adapter/frontend/components/WorkflowSubmit.tsx`

**问题**：当前代码用 `receipt?.blockNumber` 作为 taskId，应该从 `TaskCreated` 事件中提取真实的 taskId。

**找到这段代码**（搜索 `blockNumber`）：
```typescript
setTaskId(receipt?.blockNumber?.toString() || "unknown");
```

**替换为**：
```typescript
// 从 TaskCreated 事件提取真实 taskId
let extractedTaskId = receipt?.blockNumber?.toString() || "unknown";
if (receipt?.logs) {
  for (const log of receipt.logs) {
    try {
      const parsed = taskManager.interface.parseLog(log);
      if (parsed?.name === "TaskCreated") {
        extractedTaskId = parsed.args.taskId.toString();
        break;
      }
    } catch {
      // 跳过无法解析的 log
    }
  }
}
setTaskId(extractedTaskId);
```

**验收标准**：
- 提交工作流后，`taskId` 显示为合约返回的数字（如 `42`），不是区块号（如 `8932471`）

---

## Task 2：tasks/page.tsx 接入链上数据

**文件**：`packages/xlayer-adapter/frontend/app/tasks/page.tsx`

**问题**：当前任务列表全部来自 `mockService`，用户提交的真实任务不会显示。

**目标**：保留 mock 数据（演示用），同时叠加来自链上的真实任务。

### 步骤 1：在文件顶部添加 import

```typescript
import { ethers } from "ethers";
import { CONTRACTS, TASK_MANAGER_ABI, RPC_ENDPOINTS } from "@/lib/contracts";
```

### 步骤 2：在组件内添加链上任务 state

在 `export default function TasksPage()` 内，已有 state 的下方添加：

```typescript
const [chainTasks, setChainTasks] = useState<any[]>([]);
const [walletAddress, setWalletAddress] = useState<string | null>(null);
```

### 步骤 3：添加链上轮询 useEffect

在组件内添加：

```typescript
useEffect(() => {
  let cancelled = false;

  async function fetchChainTasks() {
    if (typeof window === "undefined" || !window.ethereum) return;
    try {
      const accounts = await window.ethereum.request({ method: "eth_accounts" }) as string[];
      if (!accounts?.length) return;
      const addr = accounts[0];
      setWalletAddress(addr);

      const provider = new ethers.BrowserProvider(window.ethereum);
      const taskManager = new ethers.Contract(CONTRACTS.taskManager, TASK_MANAGER_ABI, provider);

      const taskIds: bigint[] = await taskManager.getRequesterTasks(addr);
      const tasks = await Promise.all(
        taskIds.slice(-10).map(async (id) => { // 只取最近10条
          const t = await taskManager.getTask(id);
          return {
            id: t.id.toString(),
            requester: t.requester,
            status: STATUS_MAP[Number(t.status)] ?? "unknown",
            budget: ethers.formatUnits(t.totalBudget, 6) + " USDC",
            createdAt: new Date(Number(t.createdAt) * 1000).toLocaleDateString(),
            source: "chain", // 标记来源
          };
        })
      );
      if (!cancelled) setChainTasks(tasks.reverse());
    } catch (err) {
      console.warn("链上任务读取失败:", err);
    }
  }

  // TaskManager 合约状态映射
  const STATUS_MAP: Record<number, string> = {
    0: "created",
    1: "pending_confirmation",
    2: "executing",
    3: "completed",
    4: "failed",
    5: "cancelled",
    6: "timeout",
  };

  fetchChainTasks();
  const interval = setInterval(fetchChainTasks, 10_000); // 每10秒轮询
  return () => { cancelled = true; clearInterval(interval); };
}, []);
```

### 步骤 4：合并显示

找到渲染任务列表的地方（搜索 `tasks.map` 或 `mockService`），在 mock 任务列表前插入链上任务：

```typescript
// 链上任务优先显示，标记来源
const allTasks = [
  ...chainTasks.map(t => ({
    ...t,
    name: `Task #${t.id}`,
    description: `On-chain task (budget: ${t.budget})`,
    badge: "🔗 On-Chain",
  })),
  ...mockTasks, // 保留原有 mock 数据
];
```

**验收标准**：
- 连接钱包后，用户之前创建的链上任务出现在列表顶部
- 标有 "🔗 On-Chain" 标记
- 每10秒自动更新状态
- 断开钱包或没有链上任务时，仍显示 mock 数据

---

## Task 3：AgentSession.ts 集成 A2A 支付工具

**文件**：`packages/worker-cloudflare/src/agents/AgentSession.ts`

这是改动最大的任务。按照 `docs/implementation/03-a2a-protocol.md` 的完整规范实现。

### 步骤 1：在文件顶部添加常量和 import

在现有 import 之后添加：

```typescript
import { ethers } from "ethers";

const USDC_ADDRESS = "0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e";
const PAYMENT_HUB_ADDRESS = "0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60";

const USDC_TRANSFER_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

function deriveAgentWallet(masterKey: string, agentName: string): ethers.Wallet {
  const derivedKey = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
  return new ethers.Wallet(derivedKey);
}
```

### 步骤 2：在 buildTools() 中新增两个工具

在现有 `tools` 数组末尾（`list_notes` 工具之后）追加 `call_price_agent` 和 `call_trade_agent`。

完整代码见 `docs/implementation/03-a2a-protocol.md` 第 4 节。

**注意**：两个新工具的 execute 函数需要访问 `env`。修改 `buildTools` 函数签名：
```typescript
// 改为：
function buildTools(store: DOFileStore, env: Env) {
```
同时更新调用处：
```typescript
// chat() 方法内：
const tools = buildTools(store, this.env);
```

### 步骤 3：更新 SYSTEM_PROMPT

将文件底部的 `SYSTEM_PROMPT` 常量替换为 `docs/implementation/03-a2a-protocol.md` 第 6 节的版本。

**验收标准**：
- 向 Agent 发送 "帮我监控 ETH 价格，如果超过 $2800 就准备买入 0.1 ETH"
- Agent 应调用 `call_price_agent` → 链上 USDC 转账 → 等待确认 → 返回价格
- Agent 应调用 `call_trade_agent` → 链上 USDC 转账 → 评估条件 → 准备交易
- 回复中包含两条 USDC 转账的 txHash

---

## Task 4：TaskExecutor 完成后调用 PaymentHub 结算

**文件**：`packages/worker-cloudflare/src/executors/TaskExecutor.ts`

**目标**：任务执行完毕后，触发链上 PaymentHub.createEscrow 结算。

### 找到任务完成的位置

搜索 `"completed"` 或 `completeTask` 或任务状态更新的地方。

### 在任务完成时添加结算调用

```typescript
// 在任务标记为 completed 之后
const PAYMENT_HUB_ABI = [
  {
    "inputs": [
      {"internalType": "uint256", "name": "taskId", "type": "uint256"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"},
      {
        "components": [
          {"internalType": "address", "name": "agentOwner", "type": "address"},
          {"internalType": "uint256", "name": "amount", "type": "uint256"},
          {"internalType": "string", "name": "description", "type": "string"}
        ],
        "internalType": "struct PaymentHub.PaymentBreakdown[]",
        "name": "breakdown",
        "type": "tuple[]"
      }
    ],
    "name": "createEscrow",
    "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function settleA2APayment(taskId: number, totalBudget: bigint, env: Env): Promise<void> {
  if (!env.NODE_PRIVATE_KEY) {
    console.warn("[TaskExecutor] NODE_PRIVATE_KEY not set, skipping payment settlement");
    return;
  }
  try {
    const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
    const wallet = new ethers.Wallet(env.NODE_PRIVATE_KEY, provider);

    const priceAgentAddr   = deriveAgentWallet(env.NODE_PRIVATE_KEY, "price-agent").address;
    const tradeAgentAddr   = deriveAgentWallet(env.NODE_PRIVATE_KEY, "trade-agent").address;
    const orchestratorAddr = wallet.address;

    const priceShare  = totalBudget * 30n / 100n;
    const tradeShare  = totalBudget * 50n / 100n;
    const orchShare   = totalBudget - priceShare - tradeShare;

    const paymentHub = new ethers.Contract(PAYMENT_HUB_ADDRESS, PAYMENT_HUB_ABI, wallet);
    const tx = await paymentHub.createEscrow(taskId, totalBudget, [
      { agentOwner: priceAgentAddr,   amount: priceShare,  description: "Price Agent (30%)" },
      { agentOwner: tradeAgentAddr,   amount: tradeShare,  description: "Trade Agent (50%)" },
      { agentOwner: orchestratorAddr, amount: orchShare,   description: "Orchestrator (20%)" },
    ]);
    await tx.wait(1);
    console.log(`[TaskExecutor] A2A settlement complete: ${tx.hash}`);
  } catch (err) {
    console.error("[TaskExecutor] Settlement failed:", err);
    // 不 throw，结算失败不影响任务状态
  }
}
```

**调用位置**：在任务状态变为 `completed` 之后，`await settleA2APayment(taskId, task.totalBudget, this.env)`

**验收标准**：
- Worker 完成任务后，控制台输出 `A2A settlement complete: 0x...`
- X Layer testnet 上可查到 PaymentHub 合约的 `EscrowCreated` 事件

---

## Task 5：部署（用户手动操作）

这些命令**不能**由 Codex 执行，需要用户在自己的 terminal 里运行：

```bash
cd packages/worker-cloudflare

# 设置 secrets（如果还没设置）
npx wrangler secret put CF_GATEWAY_TOKEN
npx wrangler secret put NODE_PRIVATE_KEY

# 部署
npx wrangler deploy

# 验证
curl https://gradience-worker.<your-subdomain>.workers.dev/health
```

---

## 实现顺序建议

```
Task 1 (30分钟) → Task 2 (1小时) → Task 3 (2小时) → Task 4 (30分钟) → Task 5 (用户)
```

Task 1 和 Task 2 可以并行给两个 Codex 实例处理。

Task 3 是核心，改完后必须能在 wrangler dev 本地测试：
```bash
cd packages/worker-cloudflare
npx wrangler dev
# 然后用 curl 测试
curl -X POST http://localhost:8787/sessions/test/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "帮我查 ETH 的价格"}'
```

---

## 已知的坑（实现时注意）

1. **ethers 在 Worker 环境**：`packages/worker-cloudflare/package.json` 已有 `"ethers": "^6.11.0"`，直接 import 即可

2. **X Layer RPC 可能不稳定**：`env.XLAYER_RPC_URL` = `https://xlayertestrpc.okx.com`，如果超时，重试一次

3. **USDC 余额**：Worker 钱包（NODE_PRIVATE_KEY）需要有足够的 X Layer testnet USDC 才能执行 A2A 支付。如果余额不足，`call_price_agent` 会抛出错误，Agent 应告知用户

4. **wrangler.toml 的 `main`**：指向 `src/index.ts`，esbuild 会打包所有依赖。`ethers` 包较大但可以打包

5. **Task 3 中 buildTools 改了签名**：确保找到所有调用 `buildTools(store)` 的地方，全部改为 `buildTools(store, env)`（只有一处：`chat()` 方法内）
