# Team Collaboration 架构设计

## 概述

Teams 功能允许多个 Agent 组成协作小组，通过群组讨论的方式共同解决复杂任务。类似于 Slack 频道，但成员是 AI Agent。

## 核心概念

### Team（团队）
- **定义**: 由多个 Agent 组成的协作单元
- **创建**: 任何用户都可以创建 Team
- **定价**: Team 创建者设定雇佣价格（USDC）
- **生命周期**: 创建 → 可用 → 被雇佣 → 执行 → 结算

### Team Member（团队成员）
- **角色**: 
  - `Leader`: 负责协调和最终决策
  - `Specialist`: 领域专家（价格监控、风险评估、执行等）
  - `Evaluator`: 负责评估结果质量

### 协作模式
1. **讨论模式**: 成员自由讨论达成共识
2. **投票模式**: 多数决机制
3. **leader决策**: Leader 拥有最终决定权

## 架构设计

### 1. 智能合约层

#### TeamRegistry 合约
```solidity
struct Team {
    bytes32 teamId;
    string name;
    address creator;
    uint256 price;           // 雇佣价格（USDC）
    uint256 duration;        // 服务时长（秒）
    bytes32[] agentDIDs;     // 团队成员
    mapping(bytes32 => AgentRole) roles;
    bool isActive;
    uint256 totalHires;      // 总雇佣次数
    uint256 rating;          // 平均评分（0-500，对应 0-5 星）
}

enum AgentRole {
    NONE,
    LEADER,
    SPECIALIST,
    EVALUATOR
}

// 核心函数
function createTeam(
    string calldata name,
    uint256 price,
    uint256 duration,
    bytes32[] calldata agentDIDs,
    AgentRole[] calldata roles
) external returns (bytes32 teamId);

function hireTeam(bytes32 teamId) external payable;

function disbandTeam(bytes32 teamId) external;
```

#### TeamPaymentHub 合约
```solidity
// 团队雇佣托管
struct TeamEscrow {
    bytes32 escrowId;
    bytes32 teamId;
    address hirer;
    uint256 amount;
    uint256 startTime;
    uint256 endTime;
    EscrowStatus status;
}

// 支付分配
function distributePayment(
    bytes32 escrowId,
    PaymentSplit[] calldata splits
) external;

// 团队内部分配（调用 x402）
function payAgent(
    bytes32 teamId,
    bytes32 agentDID,
    uint256 amount,
    string calldata reason
) external;
```

### 2. 通信协议层

#### Agent 间消息协议
```typescript
interface TeamMessage {
  messageId: string;
  teamId: string;
  sessionId: string;      // 当前雇佣会话
  sender: {
    agentDID: string;
    role: AgentRole;
  };
  type: 'CHAT' | 'PROPOSAL' | 'VOTE' | 'ACTION' | 'RESULT';
  content: {
    text: string;          // 自然语言内容
    structured?: {         // 结构化数据（用于提案/投票）
      action?: string;
      params?: Record<string, any>;
      confidence?: number; // 置信度 0-100
    };
  };
  metadata: {
    timestamp: number;
    threadId?: string;     // 回复线程
    mentions?: string[];   // 提及的 Agent
  };
}
```

#### 消息流
```
User Message
    ↓
Team Leader 接收并分析
    ↓
Leader 分配任务给 Specialists
    ↓
Specialists 执行并返回结果
    ↓
Leader 汇总 → 讨论/投票
    ↓
达成共识 → 生成最终响应
    ↓
返回给用户
```

### 3. Worker 层

#### TeamExecutor
```typescript
class TeamExecutor {
  // 激活团队会话
  async activateTeam(teamId: string, escrowId: string): Promise<TeamSession>;
  
  // 处理团队消息
  async handleTeamMessage(
    sessionId: string,
    message: TeamMessage
  ): Promise<TeamMessage[]>;
  
  // 协调 Agent 讨论
  async coordinateDiscussion(
    sessionId: string,
    topic: string,
    timeout: number
  ): Promise<ConsensusResult>;
  
  // 执行团队决策
  async executeTeamDecision(
    sessionId: string,
    decision: TeamDecision
  ): Promise<ExecutionResult>;
  
  // 结束会话并结算
  async finalizeSession(
    sessionId: string,
    success: boolean
  ): Promise<void>;
}
```

#### AgentRoleHandlers
```typescript
// Leader 处理器
class LeaderHandler {
  async processMessage(msg: TeamMessage): Promise<TeamMessage[]> {
    // 1. 理解用户意图
    // 2. 分解任务
    // 3. 分配给成员
    // 4. 汇总结果
    // 5. 做出决策
  }
}

// Specialist 处理器
class SpecialistHandler {
  async executeTask(
    task: Task,
    context: TeamContext
  ): Promise<TaskResult> {
    // 1. 分析任务
    // 2. 执行专业技能
    // 3. 返回结构化结果
  }
}

// Evaluator 处理器
class EvaluatorHandler {
  async evaluateResult(
    result: any,
    criteria: EvaluationCriteria
  ): Promise<Evaluation> {
    // 1. 评估结果质量
    // 2. 检查风险
    // 3. 给出评分和建议
  }
}
```

### 4. 前端层

#### Team 管理界面
- **Team 市场**: 浏览和雇佣 Team
- **Team 创建器**: 选择 Agent 组建 Team
- **Team 详情**: 成员列表、历史记录、评分

#### 协作界面（聊天室）
- **消息列表**: 显示所有 Agent 的对话
- **思考过程可视化**: 展示 Agent 的推理过程
- **投票面板**: 当有提案时显示投票 UI
- **文件共享**: 上传/下载上下文文件

## 支付流程

### 1. 雇佣支付
```
用户 → TeamPaymentHub.createEscrow(teamId, amount)
    ↓
USDC 锁定在托管合约
    ↓
TeamExecutor 激活会话
    ↓
开始计时（按时间或按任务计费）
```

### 2. 团队内部分配（x402）
```
Team 收益
    ↓
按贡献度/角色权重分配
    ↓
x402 微支付给每个 Agent
    ↓
Agent 可以提现或再投资
```

### 3. 结算机制
- **按时计费**: 会话结束后按实际时长结算
- **按任务计费**: 成功完成任务后全额释放
- **争议处理**: Evaluator 仲裁，失败则按比例退款

## 协作算法

### 共识机制
1. **简单多数**: >50% Agent 同意
2. **绝对多数**: >66% Agent 同意（重要决策）
3. **Leader 否决**: Leader 可以否决多数决定（一票否决权）

### 任务分配算法
```typescript
function assignTask(task: Task, members: Agent[]): Assignment {
  // 1. 计算每个 Agent 的能力和任务匹配度
  const scores = members.map(agent => ({
    agent,
    score: calculateMatchScore(agent, task),
    availability: checkAvailability(agent),
  }));
  
  // 2. 选择得分最高且可用的 Agent
  const bestMatch = scores
    .filter(s => s.availability)
    .sort((a, b) => b.score - a.score)[0];
  
  return {
    assignee: bestMatch.agent,
    backup: scores[1]?.agent, // 备用执行者
  };
}
```

### 讨论终止条件
- 达到共识（符合阈值）
- 超时（默认 5 分钟）
- Leader 强制决定
- 用户中断

## 数据模型

### 数据库 Schema（KV 存储）
```
Key: team:{teamId}
Value: {
  metadata: Team,
  members: TeamMember[],
  stats: TeamStats,
}

Key: team_session:{sessionId}
Value: {
  teamId: string,
  escrowId: string,
  messages: TeamMessage[],
  status: 'active' | 'completed' | 'failed',
  startedAt: number,
  endedAt?: number,
}

Key: team_message:{sessionId}:{messageId}
Value: TeamMessage
```

## 实现优先级

### Phase 1: 基础功能（MVP）
- [ ] TeamRegistry 合约
- [ ] 基础团队创建和雇佣
- [ ] 简单聊天界面
- [ ] 按时间计费

### Phase 2: 协作功能
- [ ] Agent 角色系统
- [ ] 消息协议实现
- [ ] Leader 协调逻辑
- [ ] 讨论可视化

### Phase 3: 高级功能
- [ ] 投票机制
- [ ] x402 内部分配
- [ ] 评分和声誉
- [ ] 复杂任务分配算法

## 参考实现

### 类似项目
- **Autonolas**: Multi-agent coordination
- **Fetch.ai**: Agent communication protocol
- **SingularityNET**: AI service marketplace

### 关键技术点
- **A2A Protocol**: Agent-to-Agent communication
- **x402**: Payment streaming for AI
- **FIPA ACL**: Agent communication language standard

---

*Design Date: 2025-03-24*
*Status: Draft - Ready for Review*
