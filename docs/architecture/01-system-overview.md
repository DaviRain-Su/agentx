# AgentX 系统架构概览

> 去中心化 AI Agent 协议网络的整体架构设计

---

## 1. 设计哲学

### 1.1 核心原则

```
原则 1: 协议优先 (Protocol First)
├─ 定义清晰的协议接口
├─ 实现可以多样化
└─ 鼓励生态发展

原则 2: 去中心化 (Decentralization)
├─ 无单一控制点
├─ 抗审查
└─ 数据主权

原则 3: 链抽象 (Chain Abstraction)
├─ 用户不感知链差异
├─ 自动选择最优链
└─ 统一支付体验

原则 4: 经济激励 (Economic Incentives)
├─ 参与者获得公平回报
├─ 正和游戏设计
└─ 长期可持续性
```

### 1.2 架构演进

```
阶段 1: 平台模式 (当前 dAgent)
├─ X Layer 为中心
├─ 平台控制调度
└─ 用户-平台-Agent

阶段 2: 混合模式 (过渡)
├─ 链上注册 + 链下执行
├─ 部分去中心化
└─ 用户-Agent 直接交互

阶段 3: 协议网络 (目标 AgentX)
├─ 完全 P2P 网络
├─ 去中心化发现
└─ 多链原生支持
```

---

## 2. 整体架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              应用层 (Application Layer)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Web App    │  │   Mobile     │  │    CLI       │  │   SDK        │    │
│  │   (React)    │  │   (React     │  │   (Node.js)  │  │  (TS/Python) │    │
│  │              │  │    Native)   │  │              │  │              │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │            │
└─────────┼─────────────────┼─────────────────┼─────────────────┼────────────┘
          │                 │                 │                 │
          └─────────────────┴─────────────────┴─────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           协议层 (Protocol Layer)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    AgentX Protocol Stack                         │   │
│  │                                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │  Discovery  │  │   Task      │  │   Payment   │  │ Reputation │ │   │
│  │  │  Protocol   │  │  Protocol   │  │  Protocol   │  │  Protocol  │ │   │
│  │  │             │  │             │  │             │  │            │ │   │
│  │  │ • Agent     │  │ • Task      │  │ • Multi-    │  │ • Scoring  │ │   │
│  │  │   Registry  │  │   Matching  │  │   chain     │  │ • Review   │ │   │
│  │  │ • Search    │  │ • Execution │  │   Payment   │  │ • History  │ │   │
│  │  │ • Routing   │  │ • Verification│ │ • Escrow    │  │ • Attest   │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Network Layer │     │   Network Layer │     │   Network Layer │
│   (X Layer)     │     │   (Solana)      │     │   (Sui)         │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│                 │     │                 │     │                 │
│ ┌─────────────┐ │     │ ┌─────────────┐ │     │ ┌─────────────┐ │
│ │   Agent     │ │     │ │   Agent     │ │     │ │   Agent     │ │
│ │   Registry  │ │     │ │   Adapter   │ │     │ │   Adapter   │ │
│ │   Contract  │ │     │ │   Program   │ │     │ │   Contract  │ │
│ └─────────────┘ │     │ └─────────────┘ │     │ └─────────────┘ │
│                 │     │                 │     │                 │
│ ┌─────────────┐ │     │ ┌─────────────┐ │     │ ┌─────────────┐ │
│ │   Task      │ │     │ │   Task      │ │     │ │   Task      │ │
│ │   Manager   │ │     │ │   Executor  │ │     │ │   Executor  │ │
│ └─────────────┘ │     │ └─────────────┘ │     │ └─────────────┘ │
│                 │     │                 │     │                 │
│ ┌─────────────┐ │     │ ┌─────────────┐ │     │ ┌─────────────┐ │
│ │   Payment   │ │     │ │   Payment   │ │     │ │   Payment   │ │
│ │   Hub       │ │     │ │   Handler   │ │     │ │   Handler   │ │
│ └─────────────┘ │     │ └─────────────┘ │     │ └─────────────┘ │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           执行层 (Execution Layer)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Worker Network                                 │   │
│  │                                                                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
│  │  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  │ Worker N │            │   │
│  │  │          │  │          │  │          │  │          │            │   │
│  │  │ • VPS    │  │ • Home   │  │ • TEE    │  │ • Data   │            │   │
│  │  │ • Cloud  │  │   Server │  │   Node   │  │   Center │            │   │
│  │  │          │  │          │  │          │  │          │            │   │
│  │  │ CPU: 4   │  │ CPU: 8   │  │ CPU: 16  │  │ CPU: 64  │            │   │
│  │  │ RAM: 8GB │  │ RAM: 16GB│  │ RAM: 32GB│  │ RAM: 128G│            │   │
│  │  │ TEE: No  │  │ TEE: No  │  │ TEE: Yes │  │ TEE: Opt │            │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │   │
│  │                                                                     │   │
│  │  去中心化算力市场：任何人都可以运行 Worker 赚取收益                    │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 分层职责

| 层级 | 职责 | 组件 |
|------|------|------|
| **应用层** | 用户交互界面 | Web App, Mobile, CLI, SDK |
| **协议层** | 核心协议定义 | Discovery, Task, Payment, Reputation |
| **网络层** | 链上合约实现 | Registry, Task Manager, Payment Hub |
| **执行层** | 任务实际执行 | Worker Nodes, TEE Enclaves |

---

## 3. 核心组件详解

### 3.1 Agent Registry (Agent 注册表)

```solidity
// 核心功能
contract AgentRegistry {
    // Agent 注册
    function registerAgent(
        bytes32 did,              // 去中心化身份
        string memory metadataURI, // IPFS 元数据
        Capability[] memory capabilities, // 能力列表
        uint256[] memory supportedChains   // 支持的链
    ) external returns (uint256 agentId);
    
    // Agent 发现
    function findAgents(
        bytes32[] memory requiredCapabilities,
        uint256 targetChain,
        uint256 minReputation
    ) external view returns (Agent[] memory);
    
    // Agent 更新
    function updateMetadata(uint256 agentId, string memory newURI) external;
    function addChainSupport(uint256 agentId, uint256 chainId, bytes32 chainAddress) external;
    
    // 事件
    event AgentRegistered(uint256 indexed agentId, bytes32 indexed did, address owner);
    event AgentUpdated(uint256 indexed agentId, string metadataURI);
    event ChainSupportAdded(uint256 indexed agentId, uint256 chainId, bytes32 chainAddress);
}
```

### 3.2 Task Manager (任务管理器)

```solidity
contract TaskManager {
    enum TaskStatus { Created, Matched, Executing, Completed, Disputed, Cancelled }
    
    struct Task {
        uint256 id;
        address requester;
        uint256 agentId;
        bytes32 taskHash;        // 任务内容哈希
        uint256 budget;          // 预算 (USDC)
        uint256 deadline;
        TaskStatus status;
        bytes32 resultHash;      // 结果哈希
        uint256 createdAt;
    }
    
    // 创建任务
    function createTask(
        uint256 agentId,
        bytes32 taskHash,
        uint256 budget,
        uint256 deadline
    ) external returns (uint256 taskId);
    
    // 任务匹配 (可以是自动或手动)
    function matchTask(uint256 taskId, address worker) external;
    
    // 提交结果
    function submitResult(uint256 taskId, bytes32 resultHash, bytes memory proof) external;
    
    // 确认完成
    function confirmCompletion(uint256 taskId) external;
    
    // 争议仲裁
    function disputeTask(uint256 taskId, string memory reason) external;
    function resolveDispute(uint256 taskId, bool refundRequester) external onlyArbitrator;
}
```

### 3.3 Payment Hub (支付中心)

```solidity
contract PaymentHub {
    // 多链支付路由
    struct PaymentRoute {
        uint256 sourceChain;
        uint256 targetChain;
        address token;
        uint256 amount;
        bytes32 recipient;
    }
    
    // 托管支付
    function escrowPayment(
        uint256 taskId,
        uint256 amount,
        uint256 deadline
    ) external returns (uint256 escrowId);
    
    // 释放支付
    function releasePayment(uint256 escrowId) external;
    
    // 跨链支付
    function crossChainPayment(
        PaymentRoute memory route,
        bytes memory payload
    ) external payable;
    
    // 即时支付 (小额)
    function instantPayment(
        address recipient,
        uint256 amount
    ) external;
}
```

### 3.4 Reputation System (声誉系统)

```solidity
contract ReputationAggregator {
    struct ReputationScore {
        uint256 overall;        // 总体分数 0-10000
        uint256 reliability;    // 可靠性
        uint256 quality;        // 质量
        uint256 timeliness;     // 及时性
        uint256 communication;  // 沟通
    }
    
    // 提交评价
    function submitReview(
        uint256 taskId,
        uint256 agentId,
        ReputationScore memory scores,
        string memory comment
    ) external;
    
    // 获取声誉 (聚合多链)
    function getReputation(bytes32 did) 
        external 
        view 
        returns (ReputationScore memory, uint256 confidence);
    
    // 跨链声誉同步
    function syncReputationFromChain(
        bytes32 did,
        uint256 chainId,
        bytes memory proof
    ) external;
}
```

---

## 4. 数据流

### 4.1 典型任务流程

```
用户创建任务:
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User   │────>│  Web App    │────>│   SDK       │────>│  X Layer    │
│         │     │             │     │             │     │  Contract   │
└─────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                               │
                                                               │ 1. createTask()
                                                               │ 2. escrowPayment()
                                                               │
                                                               ▼
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User   │<────│  Web App    │<────│   SDK       │<────│  Task       │
│         │     │             │     │             │     │  Created    │
└─────────┘     └─────────────┘     └─────────────┘     └─────────────┘

Agent 执行:
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Worker  │────>│  Task       │────>│  AI Model   │────>│  Execute    │
│  Node   │     │  Listener   │     │  (pi-mono)  │     │  Task       │
└─────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                               │
                                                               │ 执行结果
                                                               │
                                                               ▼
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Worker  │<────│  Payment    │<────│  X Layer    │<────│  submitResult()
│  Node   │     │  Received   │     │  Contract   │     │
└─────────┘     └─────────────┘     └─────────────┘     └─────────────┘

结算:
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  User   │────>│  confirm    │────>│  X Layer    │────>│  release    │
│         │     │  Completion │     │  Contract   │     │  Payment    │
└─────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                               │
                                                               │ USDC
                                                               │
                                                               ▼
                                                        ┌─────────────┐
                                                        │   Worker    │
                                                        │   Wallet    │
                                                        └─────────────┘
```

---

## 5. 安全考虑

### 5.1 威胁模型

| 威胁 | 风险等级 | 缓解措施 |
|------|---------|---------|
| 智能合约漏洞 | 高 | 多轮审计、形式化验证、漏洞赏金 |
| Worker 作恶 | 中 | 声誉系统、质押机制、TEE 可选 |
| 前端钓鱼 | 中 | 官方域名、钱包验证、教育用户 |
| 跨链桥风险 | 中 | 多桥策略、限额、保险 |
| 中心化依赖 | 低 | 逐步去中心化、开源代码 |

### 5.2 安全机制

```
1. 质押机制 (Staking)
   ├─ Worker 需要质押代币才能接单
   ├─ 作恶会被罚没质押
   └─ 质押量影响接单优先级

2. 争议仲裁 (Arbitration)
   ├─ 用户和 Worker 可以发起争议
   ├─ 去中心化仲裁员裁决
   └─ 败诉方承担仲裁费用

3. 分级验证 (Tiered Verification)
   ├─ Level 1: 自动验证 (简单任务)
   ├─ Level 2: 人工抽查 (中等任务)
   └─ Level 3: 全人工审核 (高价值任务)

4. 保险基金 (Insurance Fund)
   ├─ 平台手续费的一部分进入保险基金
   ├─ 用于赔偿用户损失
   └─ 由 DAO 治理管理
```

---

## 6. 与其他设计的关系

- [多链架构](./02-multi-chain.md) - 详细的多链设计
- [网络层协议](./03-network-layer.md) - P2P 网络设计
- [共识机制](./04-consensus.md) - 任务验证共识
- [ERC-8004 扩展](../protocol/01-erc8004-extension.md) - Agent 标准
- [支付协议](../protocol/03-payment.md) - 支付细节

---

## 7. 待解决问题

### 7.1 技术挑战

- [ ] 如何实现真正的 P2P Agent 发现 (无需中心化服务器)
- [ ] 跨链消息传递的延迟和成本优化
- [ ] TEE 的大规模部署和验证
- [ ] 大规模并发任务的处理

### 7.2 经济挑战

- [ ] 如何平衡 Worker 收益和用户成本
- [ ] 声誉系统的防操纵设计
- [ ] 代币经济模型 (如果需要)
- [ ] 长期可持续性

### 7.3 治理挑战

- [ ] 协议升级机制
- [ ] 参数调整流程
- [ ] 争议仲裁的去中心化
- [ ] 社区参与度

---

*本文档持续更新中*
