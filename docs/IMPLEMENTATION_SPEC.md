# XAgent 实现规范文档 (For Codex)

**文档版本**: 1.0  
**目标**: 为 Codex 提供完整、精确的实现指导  
**范围**: 所有 Mock/未完成功能的完整实现  

---

## 一、架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           XAgent Platform                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐    │
│  │   Frontend   │────▶│  Smart Contracts │────▶│   Worker (Cloudflare) │   │
│  │  (Next.js)   │     │  (X Layer)       │     │   Agent Execution     │   │
│  └──────────────┘     └──────────────┘     └──────────────────────┘    │
│         │                    │                       │                   │
│         │                    │                       │                   │
│         ▼                    ▼                       ▼                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Shared Components                            │   │
│  │  - Workflow Engine  - Runtime Abstraction  - CodeFlare          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、待实现功能清单

### Priority 1: 合约连接层 (Blocking)

#### 2.1 Contract Configuration Fix

**问题**: 合约调用返回空数据

**文件**: `packages/xlayer-adapter/frontend/lib/contracts.ts`

**需要修复**:
```typescript
// 当前问题
USDC_TESTNET_ADDRESS=0x67d0E8f4Ef68D739893209bA018273a8F5Ff845e  // checksum 问题

// 需要验证:
// 1. 使用 ethers.getAddress() 获取正确 checksum 地址
// 2. 验证 ABI 与部署合约匹配
// 3. 确认 RPC 节点正确
```

**验证步骤**:
1. 访问 https://www.okx.com/web3/explorer/xlayer-test/address/{CONTRACT_ADDRESS}
2. 确认合约存在且已验证
3. 对比 ABI 与部署代码

**实现代码**:
```typescript
// 修复后的地址获取
export const getContractAddress = (address: string): string => {
  try {
    return ethers.getAddress(address);
  } catch (e) {
    console.error('Invalid address:', address);
    return address;
  }
};

// 合约配置
export const CONTRACTS = {
  taskManager: getContractAddress('0x39223444d2f9a4d6769e91aa7908CB22CA3A8686'),
  paymentHub: getContractAddress('0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60'),
  usdc: getContractAddress('0x67d0E8f4Ef68D739893209bA018273a8F5Ff845e'),
  agentRegistry8004: getContractAddress('0x8004A818BFB912233c491871b3d84c89A494BD9e'),
};
```

---

#### 2.2 RPC Provider 配置

**问题**: RPC 节点可能不稳定

**文件**: `packages/xlayer-adapter/frontend/components/Web3Provider.tsx`

**实现**:
```typescript
// 多 RPC 备用
const RPC_ENDPOINTS = [
  'https://xlayertestrpc.okx.com',
  'https://rpc.xlayer.tech/testnet',
  'https://testrpc.xlayer.network',
];

export class MultiRpcProvider {
  private providers: ethers.JsonRpcProvider[];
  
  constructor() {
    this.providers = RPC_ENDPOINTS.map(url => new ethers.JsonRpcProvider(url));
  }
  
  async call(contract: ethers.Contract, method: string, args: any[]): Promise<any> {
    for (const provider of this.providers) {
      try {
        const contractWithProvider = contract.connect(provider);
        return await contractWithProvider[method](...args);
      } catch (e) {
        console.warn(`RPC ${provider._getConnection().url} failed, trying next...`);
        continue;
      }
    }
    throw new Error('All RPC endpoints failed');
  }
}
```

---

### Priority 2: Workflow 核心流程

#### 2.3 Workflow Storage Strategy

**决策**: 使用 **IPFS** 存储 Workflow (平衡去中心化和成本)

**文件**: 
- `packages/xlayer-adapter/frontend/lib/workflowStorage.ts` (新建)
- `packages/xlayer-adapter/frontend/components/WorkflowBuilder.tsx`

**实现**:
```typescript
// workflowStorage.ts
import { create } from 'ipfs-http-client';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

export interface WorkflowData {
  name: string;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
  version: string;
}

export class WorkflowStorage {
  async saveWorkflow(workflow: WorkflowData): Promise<string> {
    // 1. 上传到 IPFS
    const ipfs = create({ url: 'https://ipfs.infura.io:5001' });
    const content = JSON.stringify(workflow);
    const result = await ipfs.add(content);
    
    // 返回 IPFS hash
    return result.path;
  }
  
  async loadWorkflow(ipfsHash: string): Promise<WorkflowData> {
    const response = await fetch(`${IPFS_GATEWAY}${ipfsHash}`);
    if (!response.ok) {
      throw new Error('Failed to load workflow from IPFS');
    }
    return response.json();
  }
  
  // 本地缓存
  saveToLocal(workflow: WorkflowData): void {
    const workflows = this.getAllLocal();
    workflows[workflow.id] = workflow;
    localStorage.setItem('xagent_workflows', JSON.stringify(workflows));
  }
  
  getAllLocal(): Record<string, WorkflowData> {
    const stored = localStorage.getItem('xagent_workflows');
    return stored ? JSON.parse(stored) : {};
  }
}
```

---

#### 2.4 Create Task 完整流程

**文件**: `packages/xlayer-adapter/frontend/components/WorkflowSubmit.tsx`

**流程图**:
```
User clicks "Submit Workflow"
    │
    ▼
┌──────────────────────┐
│ 1. Save to IPFS      │
│    Get workflowHash  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 2. Approve USDC      │
│    Check allowance   │
│    If < budget:      │
│      approve(budget) │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 3. Create Task       │
│    taskManager.      │
│    createTask(       │
│      workflowHash,   │
│      agentDIDs,      │
│      budget          │
│    )                 │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 4. Wait for receipt  │
│    Get taskId        │
│    Store in local    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 5. Redirect to       │
│    /tasks/{taskId}   │
└──────────────────────┘
```

**实现代码**:
```typescript
export class TaskService {
  private workflowStorage: WorkflowStorage;
  private taskManager: ethers.Contract;
  private usdc: ethers.Contract;
  
  async submitWorkflow(workflow: WorkflowData, budget: string): Promise<number> {
    // Step 1: Save to IPFS
    const workflowHash = await this.workflowStorage.saveWorkflow(workflow);
    
    // Step 2: Check and approve USDC
    const signer = await this.getSigner();
    const address = await signer.getAddress();
    const budgetWei = ethers.parseUnits(budget, 6);
    
    const allowance = await this.usdc.allowance(address, CONTRACTS.taskManager);
    if (allowance < budgetWei) {
      const approveTx = await this.usdc.approve(CONTRACTS.taskManager, budgetWei);
      await approveTx.wait();
    }
    
    // Step 3: Create task
    const agentDIDs = workflow.steps.map(s => s.agentDID);
    const tx = await this.taskManager.createTask(
      ethers.keccak256(ethers.toUtf8Bytes(workflowHash)),
      agentDIDs,
      budgetWei
    );
    
    // Step 4: Wait for receipt
    const receipt = await tx.wait();
    
    // Extract taskId from event
    const event = receipt.logs.find(
      (log: any) => log.topics[0] === this.taskManager.interface.getEvent('TaskCreated').topicHash
    );
    const taskId = this.taskManager.interface.decodeEventLog('TaskCreated', event.data, event.topics).taskId;
    
    // Step 5: Save to local tracking
    this.saveTaskToLocal(taskId, workflowHash, budget);
    
    return Number(taskId);
  }
  
  private saveTaskToLocal(taskId: number, workflowHash: string, budget: string): void {
    const tasks = JSON.parse(localStorage.getItem('xagent_tasks') || '[]');
    tasks.push({
      taskId,
      workflowHash,
      budget,
      createdAt: Date.now(),
    });
    localStorage.setItem('xagent_tasks', JSON.stringify(tasks));
  }
}
```

---

#### 2.5 Task Status Polling

**文件**: `packages/xlayer-adapter/frontend/components/TaskList.tsx`

**实现**:
```typescript
export class TaskMonitor {
  private taskManager: ethers.Contract;
  private pollingInterval: NodeJS.Timeout | null = null;
  
  startPolling(taskIds: number[], callback: (tasks: Task[]) => void): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    const poll = async () => {
      const tasks = await Promise.all(
        taskIds.map(id => this.taskManager.getTask(id))
      );
      callback(tasks);
    };
    
    poll(); // 立即执行一次
    this.pollingInterval = setInterval(poll, 5000); // 每 5 秒轮询
  }
  
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
```

---

### Priority 3: Agent Terminal 真实集成

#### 2.6 Agent Market 数据获取

**文件**: `packages/xlayer-adapter/frontend/lib/agentMarket.ts` (新建)

**实现**:
```typescript
// 从 8004 Registry 获取 Agent 列表
export class AgentMarketService {
  private registry8004: ethers.Contract;
  
  async getAgents(): Promise<Agent[]> {
    // 从 Charlie 8004 Registry 获取
    const agentDIDs = await this.registry8004.getAllAgents();
    
    const agents = await Promise.all(
      agentDIDs.map(async (did: string) => {
        const metadata = await this.registry8004.getAgentMetadata(did);
        return {
          id: did,
          name: metadata.name,
          description: metadata.description,
          creator: metadata.creator,
          price: metadata.price.toString(),
          isActive: metadata.isActive,
        };
      })
    );
    
    return agents.filter(a => a.isActive);
  }
  
  async purchaseAccess(agentId: string, amount: string): Promise<boolean> {
    // 调用市场合约购买访问权限
    const tx = await this.marketContract.purchaseAccess(agentId, {
      value: ethers.parseUnits(amount, 6),
    });
    await tx.wait();
    return true;
  }
}
```

---

#### 2.7 真实 AI 集成 (Claude API)

**文件**: `packages/xlayer-adapter/frontend/lib/agentChat.ts` (新建)

**实现**:
```typescript
import Anthropic from '@anthropic-ai/sdk';

export class AgentChatService {
  private anthropic: Anthropic;
  private sessionId: string;
  
  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }
  
  async sendMessage(message: string, context: ChatContext): Promise<string> {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [
        {
          role: 'system',
          content: this.buildSystemPrompt(context),
        },
        {
          role: 'user',
          content: message,
        },
      ],
    });
    
    return response.content[0].text;
  }
  
  private buildSystemPrompt(context: ChatContext): string {
    return `You are ${context.agentName}, an AI agent in the XAgent platform.
    
Context:
- User address: ${context.userAddress}
- Session ID: ${context.sessionId}
- Available tools: ${context.tools.join(', ')}

Respond helpfully and professionally.`;
  }
}
```

---

### Priority 4: Worker 部署和配置

#### 2.8 Worker Environment Configuration

**文件**: `packages/worker-cloudflare/.env` (新建)

```bash
# Blockchain
XLAYER_RPC_URL=https://xlayertestrpc.okx.com
XLAYER_CHAIN_ID=195
PRIVATE_KEY=your_worker_private_key_here

# Contracts
TASK_MANAGER_ADDRESS=0x39223444d2f9a4d6769e91aa7908CB22CA3A8686
PAYMENT_HUB_ADDRESS=0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60
USDC_ADDRESS=0x67d0E8f4Ef68D739893209bA018273a8F5Ff845e

# APIs
ANTHROPIC_API_KEY=your_key_here
COINGECKO_API_KEY=your_key_here

# KV Namespaces
GRADIENCE_KV=your_kv_namespace_id

# Durable Objects
AGENT_SESSIONS=your_do_namespace_id
```

---

#### 2.9 Worker Event Listener Fix

**文件**: `packages/worker-cloudflare/src/index.ts`

**问题**: 事件监听可能不工作

**修复代码**:
```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ... existing fetch handler
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[Worker] Scheduled event triggered:', event.scheduledTime);
    
    try {
      const provider = new ethers.JsonRpcProvider(env.XLAYER_RPC_URL);
      const taskManager = new ethers.Contract(
        env.TASK_MANAGER_ADDRESS,
        TASK_MANAGER_ABI,
        provider
      );
      
      // 获取待处理任务
      const pendingTasks = await getPendingTasks(taskManager);
      
      for (const task of pendingTasks) {
        ctx.waitUntil(executeTask(env, task));
      }
      
    } catch (error) {
      console.error('[Worker] Scheduled execution failed:', error);
    }
  },
};

async function getPendingTasks(taskManager: ethers.Contract): Promise<Task[]> {
  // 1. 从 KV 获取上次检查区块
  const lastBlock = await GRADIENCE_KV.get('last_checked_block') || '0';
  
  // 2. 查询 TaskCreated 事件
  const filter = taskManager.filters.TaskCreated();
  const currentBlock = await taskManager.provider.getBlockNumber();
  const events = await taskManager.queryFilter(filter, Number(lastBlock), currentBlock);
  
  // 3. 过滤 Pending 状态的任务
  const pendingTasks: Task[] = [];
  for (const event of events) {
    const taskId = event.args?.taskId;
    const task = await taskManager.getTask(taskId);
    if (task.status === 0) { // Pending
      pendingTasks.push({ id: taskId, ...task });
    }
  }
  
  // 4. 更新检查区块
  await GRADIENCE_KV.put('last_checked_block', currentBlock.toString());
  
  return pendingTasks;
}
```

---

#### 2.10 Worker Deployment Script

**文件**: `packages/worker-cloudflare/deploy.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Deploying XAgent Worker..."

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | xargs)
fi

# Check required vars
if [ -z "$PRIVATE_KEY" ]; then
  echo "❌ PRIVATE_KEY not set"
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build
echo "🔨 Building..."
npm run build

# Deploy
echo "☁️ Deploying to Cloudflare..."
wrangler deploy

echo "✅ Deployment complete!"
echo "Check logs with: wrangler tail"
```

---

## 三、接口定义

### 3.1 前端 - 合约接口

```typescript
// services/TaskService.ts
interface ITaskService {
  createTask(workflow: WorkflowData, budget: string): Promise<number>;
  getTask(taskId: number): Promise<Task>;
  getUserTasks(address: string): Promise<Task[]>;
  cancelTask(taskId: number): Promise<void>;
}

// services/AgentMarketService.ts
interface IAgentMarketService {
  getAgents(): Promise<Agent[]>;
  getAgent(agentId: string): Promise<Agent>;
  purchaseAccess(agentId: string, amount: string): Promise<boolean>;
}

// services/WorkflowStorage.ts
interface IWorkflowStorage {
  saveWorkflow(workflow: WorkflowData): Promise<string>; // returns hash
  loadWorkflow(hash: string): Promise<WorkflowData>;
  listWorkflows(): Promise<WorkflowData[]>;
}
```

---

### 3.2 Worker - 任务执行接口

```typescript
// handlers/TaskExecutor.ts
interface ITaskExecutor {
  execute(task: Task): Promise<ExecutionResult>;
  cancel(taskId: string): Promise<void>;
  getStatus(taskId: string): Promise<TaskStatus>;
}

// handlers/ResultSubmitter.ts
interface IResultSubmitter {
  submitResult(taskId: string, result: ExecutionResult): Promise<void>;
  submitError(taskId: string, error: Error): Promise<void>;
}
```

---

### 3.3 共享组件接口

```typescript
// packages/shared-orchestrator/src/runtime/types.ts
interface IAgentRuntime {
  initialize(): Promise<void>;
  executeAgent(agent: AgentDefinition, input: any, context: ExecutionContext): Promise<ExecutionResult>;
  health(): Promise<HealthStatus>;
  destroy(): Promise<void>;
}

interface IExecutionNode {
  register(): Promise<void>;
  acceptTask(task: Task): Promise<void>;
  executeTask(task: Task): Promise<ExecutionResult>;
  submitResult(result: ExecutionResult): Promise<void>;
}
```

---

## 四、数据结构

### 4.1 Workflow

```typescript
interface WorkflowData {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
  version: string;
  creator: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  agentDID: string;
  mode: 'sequential' | 'parallel' | 'conditional';
  config: Record<string, any>;
  dependsOn?: string[];
}
```

---

### 4.2 Task

```typescript
interface Task {
  id: number;
  requester: string;
  workflowHash: string;
  agentDIDs: string[];
  totalBudget: string;
  status: TaskStatus;
  currentStepIndex: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

type TaskStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';
```

---

### 4.3 Agent

```typescript
interface Agent {
  id: string;
  name: string;
  description: string;
  creator: string;
  price: string;
  isActive: boolean;
  metadata?: {
    icon?: string;
    tags?: string[];
    capabilities?: string[];
  };
}
```

---

## 五、测试规范

### 5.1 单元测试

每个服务必须有对应的测试文件：

```typescript
// __tests__/TaskService.test.ts
describe('TaskService', () => {
  describe('createTask', () => {
    it('should create task with valid workflow', async () => {
      // Test implementation
    });
    
    it('should throw error if USDC approval fails', async () => {
      // Test implementation
    });
  });
  
  describe('getTask', () => {
    it('should return task by id', async () => {
      // Test implementation
    });
  });
});
```

---

### 5.2 集成测试

```typescript
// __tests__/integration/workflow-e2e.test.ts
describe('Workflow E2E', () => {
  it('should complete full workflow lifecycle', async () => {
    // 1. Create workflow
    // 2. Submit task
    // 3. Wait for execution
    // 4. Verify completion
  });
});
```

---

## 六、部署清单

### 6.1 合约部署
- [ ] TaskManager 部署到 X Layer Testnet
- [ ] PaymentHub 部署到 X Layer Testnet
- [ ] TeamRegistry 部署 (可选)

### 6.2 前端部署
- [ ] 环境变量配置
- [ ] Build 验证
- [ ] Vercel/Netlify 部署

### 6.3 Worker 部署
- [ ] Cloudflare 账户配置
- [ ] KV Namespace 创建
- [ ] Durable Objects 配置
- [ ] Secrets 配置 (PRIVATE_KEY, API_KEYS)
- [ ] Deploy

---

## 七、给 Codex 的指示

**Codex 任务**:

1. **首先修复合约连接层**:
   - 修复 `contracts.ts` 中的地址和 ABI
   - 实现 `MultiRpcProvider`
   - 确保所有合约调用正常工作

2. **实现 Workflow 存储**:
   - 创建 `WorkflowStorage` 服务
   - 集成 IPFS
   - 修改 WorkflowBuilder 使用真实存储

3. **完成 Create Task 流程**:
   - 实现 `TaskService`
   - 修复 USDC Approve 流程
   - 添加任务状态轮询

4. **实现 Agent Market 真实数据**:
   - 创建 `AgentMarketService`
   - 从 8004 Registry 读取数据
   - 替换所有 Mock 数据

5. **集成真实 AI**:
   - 实现 `AgentChatService`
   - 集成 Claude API
   - 添加流式响应支持

6. **修复和部署 Worker**:
   - 实现事件监听
   - 修复任务执行逻辑
   - 配置环境变量
   - 部署到 Cloudflare

**验收标准**:
- [ ] 所有合约调用正常工作
- [ ] 可以成功创建任务并在链上查询
- [ ] Worker 自动执行创建的任务
- [ ] Agent Terminal 使用真实 AI 响应
- [ ] 所有 Mock 数据替换为真实数据

**时间估计**: 8-12 小时 (使用 CC+gstack 加速)

---

**文档结束**
