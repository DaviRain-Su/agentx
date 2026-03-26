# Agent Marketplace & Terminal 架构设计

## 当前问题

1. **Agent Terminal** 直接连 CodeFlare，绕过了市场机制
2. **免费/付费 Agent** 没有区分
3. **多人协作** Agent 的集成方式不清晰
4. **Coze 集成** 还在测试，不稳定

## 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Frontend                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Agent        │  │ Workflow     │  │ Team Collaboration   │  │
│  │ Terminal     │  │ Builder      │  │ (Multi-Agent Chat)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼───────────────┘
          │                 │                     │
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Marketplace                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Agent Registry                         │  │
│  │  (Charlie 8004 + Custom Registry)                        │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │ Free Tier   │  │ Paid Tier   │  │ Team/Enterprise │  │  │
│  │  │             │  │             │  │                 │  │  │
│  │  │ • Official  │  │ • Pro       │  │ • Custom        │  │  │
│  │  │   Agents    │  │   Agents    │  │   Agents        │  │  │
│  │  │ • Community │  │ • Verified  │  │ • White-label   │  │  │
│  │  │   Basic     │  │   Devs      │  │   Solutions     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Payment & Access                         │  │
│  │                                                           │  │
│  │  • Per-call pricing (x402)                               │  │
│  │  • Subscription tiers                                    │  │
│  │  • Team licensing                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ API Gateway / Load Balancer
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  CodeFlare      │  │  XAgent      │  │  Coze (扣子)    │
│  Workers        │  │  Workers        │  │  Integration    │
│                 │  │                 │  │                 │
│  • LLM Agents   │  │  • Task Agents  │  │  • ByteDance    │
│  • Code Gen     │  │  • Workflow     │  │    Ecosystem    │
│  • Analysis     │  │    Execution    │  │  • Pre-built    │
│                 │  │                 │  │    Bots         │
└─────────────────┘  └─────────────────┘  └─────────────────┘
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Local Node (You)  │
                    │   Optional Runtime  │
                    └─────────────────────┘
```

## Agent Terminal 正确设计

### 1. 终端作为市场入口

```typescript
interface AgentTerminalProps {
  // 可以连接不同类型的 Agent
  agentConnection: {
    type: 'marketplace' | 'direct' | 'team';
    agentId?: string;        // 市场 Agent ID
    endpoint?: string;       // 直接连接端点
    teamId?: string;         // 团队会话 ID
  };
  
  // 支付配置
  payment: {
    type: 'free' | 'per_call' | 'subscription';
    maxBudget?: string;      // 最大预算
  };
}
```

### 2. 使用流程

**场景 A：使用免费官方 Agent**
```
用户打开 Terminal
    ↓
选择 "Official Agents" → 选择 "XAgent Assistant"
    ↓
免费开始对话 (limit: 50 messages/day)
    ↓
Agent 运行在 CodeFlare/XAgent Worker
```

**场景 B：购买付费 Agent**
```
用户浏览 Marketplace
    ↓
选择 "Pro Trading Assistant" (0.01 USDC/call)
    ↓
批准 x402 支付流
    ↓
在 Terminal 中与付费 Agent 对话
    ↓
每次调用自动扣费
```

**场景 C：团队协作模式**
```
用户创建/加入 Team
    ↓
邀请多个 Agent (从市场购买)
    ↓
在 Terminal 中 @Agent 进行协作
    ↓
Team Leader Agent 协调讨论
```

## 免费 vs 付费 Agent 区分

### 免费 Agent (Official)
| Agent | 功能 | 限制 | 运行位置 |
|-------|------|------|----------|
| XAgent Assistant | 平台介绍、基础问答 | 50 msg/day | CodeFlare Worker |
| Demo Price Monitor | 示例价格监控 | 只读、延迟5min | XAgent Worker |
| Tutorial Bot | 交互式教程 | 无 | CodeFlare Worker |

### 付费 Agent (Marketplace)
| Tier | 价格 | 功能 | 提供者 |
|------|------|------|--------|
| Basic | 0.001 USDC/call | 标准功能 | 社区开发者 |
| Pro | 0.01 USDC/call | 高级分析、低延迟 | 认证开发者 |
| Enterprise | 订阅制 | 定制、SLA、支持 | 专业团队 |

## 多人协作 Agent 设计

### 团队组建流程
```typescript
// 1. 创建团队
const team = await teamRegistry.createTeam({
  name: "Alpha Trading Squad",
  agents: [
    { agentId: "price-oracle-pro", role: "LEADER" },
    { agentId: "risk-manager", role: "SPECIALIST" },
    { agentId: "sentiment-ai", role: "SPECIALIST" },
  ],
  pricing: {
    hourlyRate: "0.05",  // 团队整体时薪
  },
});

// 2. 雇佣团队
const session = await teamRegistry.hireTeam(team.id, {
  duration: 3600,  // 1小时
});

// 3. 在 Terminal 中与整个团队协作
terminal.connect({
  type: 'team',
  teamId: session.id,
});

// 4. 交互示例
User: "What's the market outlook?"
Team Leader: "Let me consult the specialists..."
Price Oracle: "ETH/USDT: $1,847 (+2.3%), trend bullish"
Risk Manager: "Volatility elevated, recommend 15% position max"
Sentiment AI: "Social sentiment: 72% bullish, whale activity up"
Team Leader: "Consensus: Cautiously bullish. Recommend small position with tight stop."
```

## Coze 集成的正确位置

### Coze 作为 Agent 的一种类型
```typescript
interface AgentDefinition {
  id: string;
  name: string;
  
  // Agent 可以来自不同平台
  provider: 'native' | 'coze' | 'openai' | 'custom';
  
  // Coze 特定配置
  cozeConfig?: {
    botId: string;
    token: string;
    conversationId?: string;
  };
  
  // 定价
  pricing: {
    type: 'free' | 'per_call';
    amount?: string;
  };
}
```

### 适配器模式
```typescript
class CozeAgentAdapter implements AgentAdapter {
  async execute(input: string, config: CozeConfig): Promise<AgentResponse> {
    // 调用 Coze API
    const response = await fetch('https://api.coze.com/open_api/v2/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bot_id: config.botId,
        user: config.userId,
        query: input,
      }),
    });
    
    return this.formatResponse(response);
  }
}
```

## 修复 Agent Terminal 组件

### 当前问题代码
```typescript
// 现在的代码直接连 CodeFlare，绕过了市场
const response = await fetch('/api/agent/chat', {
  body: JSON.stringify({ message, agentId }),
});
```

### 正确的设计
```typescript
// 1. 检查 Agent 访问权限
const access = await marketplace.checkAccess(agentId, userAddress);
if (!access.granted) {
  // 引导购买
  return <PurchaseModal agentId={agentId} pricing={access.pricing} />;
}

// 2. 获取 Agent 端点
const endpoint = await marketplace.getAgentEndpoint(agentId);
// 可能是：
// - CodeFlare Worker URL
// - XAgent Worker URL  
// - Coze API endpoint
// - Local Node endpoint

// 3. 创建会话
const session = await createSession(agentId, access.type);

// 4. 连接并对话
const chat = new AgentChat(session.id, endpoint);
```

## 实施建议

### Phase 1: 修复 Terminal (今晚)
1. 添加 Agent 市场检查
2. 区分免费/付费 Agent
3. 集成 x402 支付流

### Phase 2: 免费 Agent (明天早上)
1. 部署官方免费 Agent 到 CodeFlare
2. 配置 rate limiting
3. 更新 Terminal 默认连接免费 Agent

### Phase 3: 团队协作 (黑客松后)
1. 部署 TeamRegistry 合约
2. 实现团队聊天逻辑
3. Agent 协调算法

### Phase 4: Coze 集成 (稳定后)
1. 完成 Coze 适配器
2. 上架 Coze Agent 到市场
3. 测试端到端流程

---

**结论**：
- **Agent Terminal** 应该是市场的入口，不是直接连 CodeFlare
- **免费 Agent** 作为流量入口，**付费 Agent** 作为收入
- **Coze** 只是一种 Agent 提供者，和其他 Agent 平等
- **团队协作** 需要购买多个 Agent 组成 Team

您同意这个设计吗？今晚优先修复 Terminal 组件？
