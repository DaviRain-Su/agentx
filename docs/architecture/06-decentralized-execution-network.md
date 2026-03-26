# Decentralized Agent Execution Network

## 愿景

构建一个开放的 Agent 执行网络，任何设备（Cloudflare Worker、本地电脑、云服务器、边缘设备）都可以作为执行节点加入，形成去中心化的 AI 算力市场。

## 核心概念

### Execution Node（执行节点）
任何可以执行 Agent 代码的设备/环境：
- **Edge Worker**: Cloudflare Workers, Vercel Edge, Deno Deploy
- **Local Node**: 本地电脑、树莓派、边缘设备
- **Cloud Instance**: AWS Lambda, GCP Cloud Functions, 自建服务器
- **Specialized Hardware**: GPU 服务器、AI 推理专用设备

### Node Capability（节点能力）
节点注册时可以声明的能力：
```typescript
interface NodeCapability {
  // 执行环境
  runtime: 'cloudflare-worker' | 'node' | 'deno' | 'docker' | 'wasm';
  
  // 硬件能力
  resources: {
    memory: number;      // MB
    cpu: number;         // cores
    gpu?: boolean;       // GPU available
    storage?: number;    // MB
  };
  
  // Agent 类型支持
  agentTypes: string[]; // ['price-monitor', 'trade-executor', 'llm-inference']
  
  // 地理位置
  region: string;       // 'us-east', 'eu-west', 'asia-pacific'
  
  // 网络特性
  network: {
    latency: number;     // avg ms
    bandwidth: number;   // Mbps
  };
  
  // 定价
  pricing: {
    perExecution: string;  // USDC amount
    perSecond: string;     // USDC amount for long-running tasks
  };
}
```

## 架构设计

### 1. 网络拓扑

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Execution Network                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│   │  Node A      │    │  Node B      │    │  Node C      │ │
│   │  (Local PC)  │◄──►│  (CF Worker) │◄──►│  (AWS EC2)   │ │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘ │
│          │                   │                   │          │
│          └───────────────────┼───────────────────┘          │
│                              │                              │
│                    ┌─────────▼──────────┐                   │
│                    │   Registry Hub     │                   │
│                    │  (Smart Contract)  │                   │
│                    └─────────┬──────────┘                   │
│                              │                              │
│          ┌───────────────────┼───────────────────┐          │
│          │                   │                   │          │
│   ┌──────▼───────┐    ┌──────▼───────┐    ┌──────▼───────┐ │
│   │  Node D      │    │  Node E      │    │  Node F      │ │
│   │  (Raspberry) │◄──►│  (Vercel)    │◄──►│  (GCP)       │ │
│   └──────────────┘    └──────────────┘    └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2. 协议层

#### 2.1 节点注册协议
```typescript
interface NodeRegistration {
  // 节点身份
  nodeId: string;           // DID
  publicKey: string;        // 用于签名验证
  
  // 节点信息
  endpoint: string;         // 可访问的地址
  capabilities: NodeCapability;
  
  // 质押（可选，用于经济安全）
  stake?: {
    token: string;
    amount: string;
  };
  
  // 证明
  proof: {
    type: 'signature';
    value: string;          // 签名的注册数据
  };
}
```

#### 2.2 任务分配协议
```typescript
interface TaskAssignment {
  taskId: string;
  workflowId: string;
  
  // 执行要求
  requirements: {
    agentType: string;
    minResources: ResourceRequirements;
    maxLatency: number;
    preferredRegions?: string[];
  };
  
  // 任务内容
  payload: {
    agentCode: string;      // 或 CID 引用
    input: any;
    timeout: number;
  };
  
  // 支付
  payment: {
    amount: string;
    token: string;
    escrowId: string;
  };
}
```

#### 2.3 执行结果协议
```typescript
interface ExecutionResult {
  taskId: string;
  nodeId: string;
  
  // 执行状态
  status: 'success' | 'failed' | 'timeout';
  
  // 结果
  output: any;
  logs: string[];
  
  // 执行证明
  proof: {
    executionTime: number;  // ms
    memoryUsed: number;     // MB
    signature: string;      // 节点签名
  };
  
  // 错误信息
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}
```

### 3. 节点运行时抽象

#### 3.1 通用接口
```typescript
abstract class AgentRuntime {
  // 生命周期
  abstract initialize(config: RuntimeConfig): Promise<void>;
  abstract destroy(): Promise<void>;
  
  // 执行
  abstract executeAgent(
    agent: AgentDefinition,
    input: any,
    context: ExecutionContext
  ): Promise<ExecutionResult>;
  
  // 健康检查
  abstract health(): Promise<HealthStatus>;
  
  // 指标
  abstract metrics(): Promise<RuntimeMetrics>;
}
```

#### 3.2 Cloudflare Worker 实现
```typescript
class CloudflareRuntime extends AgentRuntime {
  async executeAgent(agent, input, context) {
    // 使用 CF Worker 的 Isolate 执行
    // 限制: 50ms CPU time, 128MB memory
    const result = await this.executeInIsolate(agent, input);
    return result;
  }
}
```

#### 3.3 Node.js 本地实现
```typescript
class NodeRuntime extends AgentRuntime {
  private workers: WorkerPool;
  
  async executeAgent(agent, input, context) {
    // 使用 Worker Threads 隔离执行
    // 可以运行更复杂的 Agent，访问本地资源
    const worker = await this.workers.acquire();
    const result = await worker.execute(agent, input);
    return result;
  }
}
```

#### 3.4 Docker 容器实现
```typescript
class DockerRuntime extends AgentRuntime {
  async executeAgent(agent, input, context) {
    // 启动临时容器执行 Agent
    // 完全隔离，支持任意依赖
    const container = await this.spawnContainer(agent.image);
    const result = await container.run(agent.code, input);
    await container.destroy();
    return result;
  }
}
```

### 4. 网络通信

#### 4.1 节点间通信
使用 WebSocket 或 WebRTC 建立 P2P 连接：

```typescript
interface NodeNetwork {
  // 连接到网络
  connect(bootstrapNodes: string[]): Promise<void>;
  
  // 发现其他节点
  discoverNodes(filter: NodeFilter): Promise<NodeInfo[]>;
  
  // 发送任务给其他节点
  delegateTask(nodeId: string, task: Task): Promise<TaskId>;
  
  // 接收任务
  onTaskReceived(handler: TaskHandler): void;
  
  // 发送结果
  sendResult(nodeId: string, result: ExecutionResult): Promise<void>;
}
```

#### 4.2 消息格式（基于 libp2p 或类似）
```protobuf
message NetworkMessage {
  string message_id = 1;
  string sender_id = 2;
  string receiver_id = 3;
  
  enum MessageType {
    PING = 0;
    PONG = 1;
    TASK_OFFER = 2;
    TASK_ACCEPT = 3;
    TASK_RESULT = 4;
    NODE_ANNOUNCE = 5;
    NODE_QUERY = 6;
  }
  
  MessageType type = 4;
  bytes payload = 5;
  int64 timestamp = 6;
  bytes signature = 7;
}
```

### 5. 任务调度算法

#### 5.1 节点选择策略
```typescript
interface SchedulingStrategy {
  // 成本优先：选择最便宜的节点
  costOptimized(tasks: Task[], nodes: Node[]): Assignment[];
  
  // 延迟优先：选择最近的节点
  latencyOptimized(tasks: Task[], nodes: Node[]): Assignment[];
  
  // 可靠性优先：选择高评分节点
  reliabilityOptimized(tasks: Task[], nodes: Node[]): Assignment[];
  
  // 负载均衡：均匀分配任务
  loadBalanced(tasks: Task[], nodes: Node[]): Assignment[];
}
```

#### 5.2 动态定价
```typescript
interface DynamicPricing {
  // 基于供需的定价
  calculatePrice(
    task: Task,
    availableNodes: number,
    pendingTasks: number
  ): string;
  
  // 节点竞价
  requestBids(task: Task, nodes: Node[]): Promise<Bid[]>;
  selectBestBid(bids: Bid[]): Bid;
}
```

### 6. 安全机制

#### 6.1 沙箱隔离
每个 Agent 运行在隔离环境中：
- **V8 Isolate**: Cloudflare Workers 使用
- **VM2**: Node.js 沙箱
- **Firecracker MicroVM**: AWS Lambda 使用
- **gVisor**: 容器沙箱

#### 6.2 结果验证
```typescript
interface ResultVerification {
  // 确定性执行验证
  async verifyDeterministic(
    agent: Agent,
    input: any,
    result: ExecutionResult,
    samples: number  // 验证样本数
  ): Promise<boolean>;
  
  // 共识验证
  async verifyByConsensus(
    results: ExecutionResult[],
    threshold: number  // 一致阈值
  ): Promise<ExecutionResult>;
  
  // 零知识证明验证（未来）
  async verifyZKProof(proof: ZKProof): Promise<boolean>;
}
```

#### 6.3 经济安全
- 节点需要质押代币才能参与
- 错误执行会罚没质押
- 正确执行获得奖励

### 7. 实现路线图

#### Phase 1: 基础网络（当前）
- [ ] 抽象 Runtime 接口
- [ ] Cloudflare Worker 实现
- [ ] Node.js 本地实现
- [ ] 简单 P2P 通信

#### Phase 2: 多节点协作
- [ ] 节点注册合约
- [ ] 任务分配算法
- [ ] 结果验证机制
- [ ] 基础支付结算

#### Phase 3: 去中心化市场
- [ ] 动态定价
- [ ] 节点声誉系统
- [ ] 多节点共识执行
- [ ] 跨链结算

#### Phase 4: 高级功能
- [ ] GPU 支持
- [ ] 私有 Agent 执行
- [ ] 联邦学习支持
- [ ] 边缘设备支持

## 代码实现

### 运行时工厂
```typescript
// packages/shared-orchestrator/src/runtime/RuntimeFactory.ts
export class RuntimeFactory {
  static create(type: RuntimeType, config: RuntimeConfig): AgentRuntime {
    switch (type) {
      case 'cloudflare-worker':
        return new CloudflareRuntime(config);
      case 'node':
        return new NodeRuntime(config);
      case 'docker':
        return new DockerRuntime(config);
      default:
        throw new Error(`Unknown runtime: ${type}`);
    }
  }
}
```

### 节点注册
```typescript
// packages/shared-orchestrator/src/network/NodeRegistry.ts
export class NodeRegistry {
  async registerNode(
    nodeInfo: NodeRegistration,
    contract: ethers.Contract
  ): Promise<void> {
    const tx = await contract.registerNode(
      nodeInfo.nodeId,
      nodeInfo.endpoint,
      this.encodeCapabilities(nodeInfo.capabilities),
      nodeInfo.proof.value
    );
    await tx.wait();
  }
  
  async discoverNodes(
    requirements: TaskRequirements,
    contract: ethers.Contract
  ): Promise<NodeInfo[]> {
    const nodeIds = await contract.getNodesForTask(
      requirements.agentType,
      requirements.minResources.memory,
      requirements.maxLatency
    );
    
    return Promise.all(
      nodeIds.map(id => contract.getNodeInfo(id))
    );
  }
}
```

### 任务调度器
```typescript
// packages/shared-orchestrator/src/scheduler/TaskScheduler.ts
export class TaskScheduler {
  constructor(
    private registry: NodeRegistry,
    private strategy: SchedulingStrategy
  ) {}
  
  async scheduleTask(task: Task): Promise<TaskAssignment> {
    // 1. 发现可用节点
    const nodes = await this.registry.discoverNodes(task.requirements);
    
    // 2. 过滤不符合要求的节点
    const eligibleNodes = nodes.filter(n => 
      this.meetsRequirements(n, task.requirements)
    );
    
    // 3. 应用调度策略
    const assignments = this.strategy.select(eligibleNodes, task);
    
    // 4. 创建任务分配
    const assignment = await this.createAssignment(task, assignments[0]);
    
    return assignment;
  }
}
```

## 与现有系统的整合

### 当前 Cloudflare Worker
```typescript
// packages/worker-cloudflare/src/index.ts
import { CloudflareRuntime } from '@xagent/shared-orchestrator';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const runtime = new CloudflareRuntime({
      maxMemoryMB: 128,
      maxCpuMs: 50,
    });
    
    const node = new ExecutionNode(runtime, {
      nodeId: env.NODE_ID,
      privateKey: env.NODE_PRIVATE_KEY,
      registryContract: env.REGISTRY_CONTRACT,
    });
    
    await node.initialize();
    
    return node.handleRequest(request);
  }
};
```

### 本地节点
```typescript
// packages/node-local/src/index.ts
import { NodeRuntime } from '@xagent/shared-orchestrator';

async function main() {
  const runtime = new NodeRuntime({
    maxWorkers: 4,
    maxMemoryMB: 2048,
  });
  
  const node = new ExecutionNode(runtime, {
    nodeId: process.env.NODE_ID!,
    privateKey: process.env.NODE_PRIVATE_KEY!,
    endpoint: process.env.NODE_ENDPOINT!,
    capabilities: {
      runtime: 'node',
      resources: { memory: 2048, cpu: 4 },
      agentTypes: ['price-monitor', 'llm-inference'],
      region: 'us-east',
      pricing: {
        perExecution: '0.1',
        perSecond: '0.001',
      },
    },
  });
  
  await node.start();
  console.log(`Node ${node.id} running on ${node.endpoint}`);
}

main();
```

---

*Design Date: 2025-03-24*
*Status: Draft - Ready for Implementation*
