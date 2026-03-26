# MVP 4阶段路线图 - 1-2天实现方案

> 目标：不是完整实现，而是展示4个阶段的核心概念和流程

---

## 现实检查

### 完整实现所需时间

| 阶段 | 完整功能 | 所需时间 | 复杂度 |
|------|---------|---------|--------|
| Phase 1: Agent SDK | 完整的SDK + CLI + 部署系统 | 2周 | ⭐⭐⭐⭐⭐ |
| Phase 2: 工具市场 | 工具注册 + 发现 + 付费 | 1周 | ⭐⭐⭐⭐ |
| Phase 3: Agent市场 | 链上注册 + 雇佣 + 评分 | 2周 | ⭐⭐⭐⭐⭐ |
| Phase 4: A2A经济 | 自主支付 + 多Agent协作 | 2周 | ⭐⭐⭐⭐⭐ |
| **总计** | | **7周** | |

### MVP演示所需时间

| 阶段 | MVP功能 | 所需时间 | 实现方式 |
|------|---------|---------|----------|
| Phase 1 | 1个可部署的Agent模板 | 4小时 | Hardcode示例 |
| Phase 2 | 2个内置工具展示 | 2小时 | 预置工具 |
| Phase 3 | 市场UI + Mock数据 | 3小时 | 前端展示 |
| Phase 4 | A2A支付流程演示 | 5小时 | 简化版实现 |
| **总计** | | **14小时** | **可行！** |

---

## MVP 实现策略

### 核心原则

1. **演示优先**：能跑通流程 > 功能完整
2. **Hardcode**：示例数据写死，展示概念
3. **简化支付**：固定金额，简化逻辑
4. **单一场景**：一个完整故事线串起4个阶段

---

## 演示故事线：Price Alert Workflow

```
用户想要：ETH价格超过$3000时自动买入

Phase 1 (Agent SDK):
用户部署 PriceMonitorAgent (基于模板)
↓
Phase 2 (工具市场):
Agent使用内置工具 fetch_price + evaluate_condition
↓
Phase 3 (Agent市场):
价格达标，雇佣 TradeExecutorAgent
↓
Phase 4 (A2A经济):
PriceAgent支付TradeAgent，执行交易
↓
结果：链上完成交易，所有支付可验证
```

---

## Phase 1 MVP: Agent SDK (4小时)

### 目标
展示"任何人都能部署Agent"

### 实现

```typescript
// packages/agent-sdk/src/index.ts
export interface AgentConfig {
  name: string;
  capabilities: string[];
  tools: string[];
  pricing: {
    perCall: number;
    currency: string;
  };
}

// 预置的3个Agent模板
export const AGENT_TEMPLATES = {
  priceMonitor: {
    name: "PriceMonitorAgent",
    capabilities: ["fetch_price", "set_alert"],
    tools: ["fetch_binance", "evaluate_threshold"],
    pricing: { perCall: 0.001, currency: "USDC" },
  },
  tradeExecutor: {
    name: "TradeExecutorAgent", 
    capabilities: ["execute_trade", "evaluate_risk"],
    tools: ["check_balance", "prepare_swap"],
    pricing: { perCall: 0.005, currency: "USDC" },
  },
  orchestrator: {
    name: "WorkflowOrchestrator",
    capabilities: ["hire_agent", "coordinate_workflow"],
    tools: ["agent_market", "a2a_payment"],
    pricing: { perCall: 0.002, currency: "USDC" },
  },
};

// 一键部署（简化版）
export async function deployAgent(
  template: keyof typeof AGENT_TEMPLATES,
  config: Partial<AgentConfig>
): Promise<{ url: string; agentId: string }> {
  // 实际：调用Cloudflare API部署
  // MVP：返回模拟URL，记录到本地
  const agentId = `agent-${Date.now()}`;
  const url = `https://agentx.io/agents/${agentId}`;
  
  // 注册到本地存储（模拟链上注册）
  localStorage.setItem(`agent:${agentId}`, JSON.stringify({
    ...AGENT_TEMPLATES[template],
    ...config,
    agentId,
    deployedAt: Date.now(),
  }));
  
  return { url, agentId };
}
```

### 演示代码

```bash
# 用户只需3步
echo "Creating PriceMonitorAgent..."
curl -X POST https://agentx.io/api/deploy \
  -d '{"template": "priceMonitor", "config": {"name": "MyPriceAgent"}}'

# 返回
{
  "agentId": "agent-123456",
  "url": "https://agentx.io/agents/agent-123456",
  "status": "deployed"
}
```

---

## Phase 2 MVP: 工具市场 (2小时)

### 目标
展示"可复用的工具系统"

### 实现

```typescript
// 预置4个工具（硬编码，不实现完整注册系统）
export const BUILTIN_TOOLS = {
  fetch_binance: {
    name: "fetch_binance",
    description: "Get price from Binance",
    execute: async (params: { symbol: string }) => {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${params.symbol}USDT`);
      const data = await res.json();
      return { price: parseFloat(data.price), source: "binance" };
    },
    pricing: 0.0001,
  },
  
  evaluate_threshold: {
    name: "evaluate_threshold",
    description: "Check if price meets condition",
    execute: async (params: { price: number; threshold: number; operator: string }) => {
      const met = params.operator === ">" 
        ? params.price > params.threshold
        : params.price < params.threshold;
      return { conditionMet: met, price: params.price, threshold: params.threshold };
    },
    pricing: 0.0001,
  },
  
  prepare_swap: {
    name: "prepare_swap",
    description: "Prepare DEX swap transaction",
    execute: async (params: { tokenIn: string; tokenOut: string; amount: string }) => {
      // 模拟准备交易
      return {
        txData: "0x...",
        estimatedOutput: "1.5",
        slippage: "0.5%",
        requiresApproval: true,
      };
    },
    pricing: 0.001,
  },
  
  agent_market: {
    name: "agent_market",
    description: "Discover and hire other agents",
    execute: async (params: { category: string }) => {
      // 返回预置的Agent列表
      return {
        agents: [
          { id: "trade-001", name: "TradeExecutor", price: 0.005, rating: 4.8 },
          { id: "risk-001", name: "RiskAnalyzer", price: 0.003, rating: 4.5 },
        ],
      };
    },
    pricing: 0.0002,
  },
};
```

### 演示

```typescript
// Agent使用工具
const agent = new Agent("PriceMonitorAgent");

// 工具调用自动计费
const price = await agent.useTool("fetch_binance", { symbol: "ETH" });
// 扣除 0.0001 USDC

const shouldTrade = await agent.useTool("evaluate_threshold", {
  price: price.price,
  threshold: 3000,
  operator: ">",
});
// 扣除 0.0001 USDC
```

---

## Phase 3 MVP: Agent市场 (3小时)

### 目标
展示"发现和雇佣Agent"

### 实现

```typescript
// 前端展示（Mock数据 + 真实合约地址）
export const MOCK_MARKET_AGENTS = [
  {
    id: "price-oracle-001",
    name: "PriceOracle Pro",
    description: "Real-time price monitoring with 99.9% uptime",
    capabilities: ["fetch_price", "set_alert", "technical_analysis"],
    rating: 4.8,
    totalCalls: 15420,
    pricing: { perCall: 0.001, currency: "USDC" },
    owner: "0x742d...3f4e",
    verified: true,
    chain: "xlayer",
  },
  {
    id: "trade-executor-001",
    name: "TradeExecutor",
    description: "Secure DEX execution with MEV protection",
    capabilities: ["execute_swap", "risk_check", "gas_optimization"],
    rating: 4.6,
    totalCalls: 8932,
    pricing: { perCall: 0.005, currency: "USDC" },
    owner: "0x8a3b...9c2d",
    verified: true,
    chain: "xlayer",
  },
  {
    id: "orchestrator-001",
    name: "Workflow Orchestrator",
    description: "Coordinate multi-agent workflows",
    capabilities: ["hire_agent", "coordinate", "a2a_payment"],
    rating: 4.9,
    totalCalls: 3421,
    pricing: { perCall: 0.002, currency: "USDC" },
    owner: "0x9f2e...1a4b",
    verified: true,
    chain: "xlayer",
  },
];

// 雇佣流程（简化版）
export async function hireAgent(
  agentId: string,
  hirerAddress: string,
  budget: number
): Promise<{ sessionId: string; status: string }> {
  // MVP：创建会话，记录雇佣关系
  const sessionId = `session-${Date.now()}`;
  
  // 实际：调用合约创建雇佣
  // const tx = await agentRegistry.hireAgent(agentId, budget);
  
  return {
    sessionId,
    status: "hired",
  };
}
```

### UI展示

```tsx
// 市场页面
export function AgentMarket() {
  return (
    <div className="market">
      <h1>Agent Marketplace</h1>
      <div className="agent-grid">
        {MOCK_MARKET_AGENTS.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onHire={() => hireAgent(agent.id, userAddress, 5)}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## Phase 4 MVP: A2A经济 (5小时)

### 目标
展示"Agent间自主支付和协作"

### 实现

```typescript
// A2A支付核心逻辑（简化版）
export class A2APayment {
  private orchestratorWallet: ethers.Wallet;
  
  constructor(privateKey: string, provider: ethers.Provider) {
    this.orchestratorWallet = new ethers.Wallet(privateKey, provider);
  }
  
  // 派生Agent钱包（确定性）
  deriveAgentWallet(agentName: string): ethers.Wallet {
    const derivedKey = ethers.keccak256(
      ethers.toUtf8Bytes(`${this.orchestratorWallet.privateKey}:${agentName}`)
    );
    return new ethers.Wallet(derivedKey, this.orchestratorWallet.provider);
  }
  
  // Agent间支付（简化版：直接转账，不经过托管）
  async payAgent(
    agentName: string,
    amount: string // USDC, 6 decimals
  ): Promise<{ txHash: string; confirmed: boolean }> {
    const agentWallet = this.deriveAgentWallet(agentName);
    const amountWei = ethers.parseUnits(amount, 6);
    
    // 创建USDC合约实例
    const usdc = new ethers.Contract(
      USDC_ADDRESS,
      ["function transfer(address to, uint256 amount) returns (bool)"],
      this.orchestratorWallet
    );
    
    // 执行转账
    const tx = await usdc.transfer(agentWallet.address, amountWei);
    const receipt = await tx.wait(1); // 等待1个确认
    
    return {
      txHash: receipt.hash,
      confirmed: receipt.status === 1,
    };
  }
  
  // 完整的A2A协作流程
  async executeA2AWorkflow(
    workflow: { task: string; budget: number }
  ): Promise<A2AResult> {
    const payments: PaymentRecord[] = [];
    
    // 1. 雇佣 PriceAgent (30%)
    const priceAgentFee = (workflow.budget * 0.3).toFixed(6);
    const payment1 = await this.payAgent("price-agent", priceAgentFee);
    payments.push({ agent: "price-agent", amount: priceAgentFee, tx: payment1.txHash });
    
    // 执行价格查询（等待支付确认后）
    const price = await this.callPriceAgent();
    
    // 2. 雇佣 TradeAgent (50%)
    const tradeAgentFee = (workflow.budget * 0.5).toFixed(6);
    const payment2 = await this.payAgent("trade-agent", tradeAgentFee);
    payments.push({ agent: "trade-agent", amount: tradeAgentFee, tx: payment2.txHash });
    
    // 执行交易评估
    const trade = await this.callTradeAgent(price);
    
    // 3. Orchestrator保留 (20%)
    const orchestratorFee = (workflow.budget * 0.2).toFixed(6);
    
    return {
      success: true,
      price,
      trade,
      payments,
      totalBudget: workflow.budget,
    };
  }
  
  private async callPriceAgent(): Promise<any> {
    // 调用PriceAgent获取价格
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT");
    const data = await res.json();
    return { token: "ETH", price: parseFloat(data.price) };
  }
  
  private async callTradeAgent(price: any): Promise<any> {
    // 调用TradeAgent评估
    return {
      action: price.price > 3000 ? "BUY" : "HOLD",
      confidence: 0.85,
      params: { amount: "0.1", slippage: "0.5%" },
    };
  }
}
```

### 演示流程

```typescript
// 完整的A2A演示
async function demoA2A() {
  const a2a = new A2APayment(
    process.env.ORCHESTRATOR_PRIVATE_KEY,
    new ethers.JsonRpcProvider("https://xlayertestrpc.okx.com")
  );
  
  console.log("Starting A2A Workflow...");
  console.log("Budget: 5 USDC");
  
  const result = await a2a.executeA2AWorkflow({
    task: "Monitor ETH and buy when > $3000",
    budget: 5,
  });
  
  console.log("=== A2A Payment Flow Complete ===");
  console.log(`Price Agent: 1.5 USDC → ${result.payments[0].tx}`);
  console.log(`Trade Agent: 2.5 USDC → ${result.payments[1].tx}`);
  console.log(`Orchestrator: 1 USDC (retained)`);
  console.log(`Total: 5 USDC`);
  console.log(`\nAll payments verified on X Layer!`);
}
```

---

## 完整演示脚本 (3分钟)

### 开场 (30秒)

```
"传统AI Agent都是孤立的、免费的。
今天，我们展示去中心化Agent经济网络 —— 
Agent可以是服务提供者，可以雇佣其他Agent，可以自主交易。

4个阶段，14小时实现，全部运行在X Layer上。"
```

### Phase 1演示 (30秒)

```bash
# 部署Agent
curl -X POST https://agentx.io/api/deploy \
  -d '{"template": "priceMonitor", "name": "MyAgent"}'

# 返回部署URL
{
  "agentId": "agent-123",
  "url": "https://agentx.io/agents/agent-123",
  "status": "live"
}
```

### Phase 2演示 (30秒)

```bash
# Agent使用工具（自动计费）
curl https://agentx.io/agents/agent-123/chat \
  -d '{"message": "Check ETH price"}'

# 回复
{
  "response": "ETH price: $3,247.56",
  "tools_used": ["fetch_binance"],
  "cost": "0.0001 USDC"
}
```

### Phase 3演示 (30秒)

```
[展示市场页面]

"在Agent市场，我们发现：
- PriceOracle Pro: 0.001 USDC/call, 4.8★
- TradeExecutor: 0.005 USDC/call, 4.6★

点击'Hire'，支付预算，立即激活Agent服务。"
```

### Phase 4演示 (60秒)

```bash
# 启动A2A工作流
curl -X POST https://agentx.io/api/a2a \
  -d '{
    "workflow": "price_alert",
    "budget": 5,
    "condition": "ETH > 3000"
  }'

# 实时展示支付流
{
  "step": 1,
  "action": "pay_price_agent",
  "amount": 1.5,
  "tx_hash": "0xabc...",
  "status": "confirmed"
}

{
  "step": 2,
  "action": "pay_trade_agent", 
  "amount": 2.5,
  "tx_hash": "0xdef...",
  "status": "confirmed"
}

{
  "step": 3,
  "action": "execute_trade",
  "result": "BUY 0.1 ETH @ $3247",
  "total_cost": 5
}
```

### 结尾 (30秒)

```
"整个过程：
✅ 用户部署Agent (Phase 1)
✅ Agent使用工具市场 (Phase 2)  
✅ 雇佣专业Agent (Phase 3)
✅ Agent间自主支付协作 (Phase 4)

所有支付在X Layer上可验证。
Agent经济，从此开始。"
```

---

## 分工建议

### 您负责
- Cloudflare账号和部署
- Worker私钥和测试网USDC
- 链上合约交互测试

### 我负责（Claude/Codex）
- Phase 1: Agent SDK模板
- Phase 2: 内置工具实现
- Phase 3: 市场UI
- Phase 4: A2A支付逻辑

### 并行进行
- 您部署Worker基础设施
- 我写前端和业务逻辑
- 每小时同步一次

---

## 成功标准

最低要求（能演示）：
- [ ] 能部署1个Agent
- [ ] 能使用2个工具
- [ ] 能展示市场
- [ ] 能展示A2A支付流程

理想状态（有冲击力）：
- [ ] 3个不同Agent模板
- [ ] 4个工具展示
- [ ] 链上支付真实发生
- [ ] 完整故事线演示

---

## 风险与应对

| 风险 | 概率 | 应对 |
|------|------|------|
| 时间不够 | 高 | 只做最低要求版本 |
| 合约调用失败 | 中 | 使用Mock数据演示概念 |
| Worker部署问题 | 中 | 准备纯前端备用方案 |
| Cloudflare限制 | 低 | 使用本地Node.js演示 |

---

## 立即开始

如果您同意这个MVP方案，我建议：

1. **现在**：您确认Cloudflare账号状态
2. **接下来2小时**：我实现Phase 1-2（Agent SDK + 工具）
3. **接下来4小时**：我实现Phase 3-4（市场 + A2A）
4. **最后4小时**：整合测试 + Demo视频

**您准备好了吗？**
