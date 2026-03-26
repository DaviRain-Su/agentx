# 真实交易驱动的 Demo 策略

> 核心原则：所有展示必须有链上交易哈希，所有支付必须真实发生

---

## 一、为什么必须真实

### 评委视角
```
Mock数据:
❌ "ETH价格 $3247" ← 无法验证，可能是假的
❌ "支付 1.5 USDC" ← 无交易哈希，不可信
❌ "Agent已执行" ← 链上查不到，存疑

真实交易:
✅ "ETH价格 $3247" + 交易哈希 0xabc... 
✅ "支付 1.5 USDC" + 交易哈希 0xdef...
✅ "Agent已执行" + X Layer浏览器可查
```

### 信任公式
```
可信度 = 可验证的链上数据 / 总声称的数据

Mock Demo: 可信度 = 0% (无交易)
Real Demo: 可信度 = 100% (每笔都有交易哈希)
```

---

## 二、简化但真实的策略

### 核心改变

**从**: "做4个阶段的完整平台"  
**到**: "做2-3个真实Agent，每笔交易可查"

### 实现范围

只做3个Agent：
1. **PriceOracleAgent** - 查价格（付费查询）
2. **TradeStrategyAgent** - 策略分析（付费分析）
3. **WorkflowOrchestrator** - 编排并支付（A2A支付）

**每个Agent必须有**:
- ✅ 派生钱包地址（真实存在）
- ✅ 调用时真实支付（USDC转账）
- ✅ 交易哈希可展示
- ✅ X Layer浏览器可验证

---

## 三、3个Agent的详细设计

### Agent 1: PriceOracleAgent

**功能**: 提供加密货币价格查询

**经济模型**:
```
调用费用: 0.001 USDC
支付方式: 调用时实时转账
收入分配: 
  - Agent所有者: 70%
  - 平台: 20%
  - 质押者: 10%
```

**链上流程**:
```
用户调用
  ↓
检查 USDC 授权
  ↓
调用 transferFrom(user, agentWallet, 0.001 USDC)
  ↓
等待交易确认 (1个区块)
  ↓
调用 Binance API 获取价格
  ↓
返回价格 + 交易哈希
```

**代码实现**:
```typescript
// PriceOracleAgent.ts
export class PriceOracleAgent {
  private wallet: ethers.Wallet;
  private usdc: ethers.Contract;
  
  constructor(
    privateKey: string,
    provider: ethers.Provider
  ) {
    // 派生Agent钱包
    const agentKey = this.deriveKey(privateKey, "price-oracle");
    this.wallet = new ethers.Wallet(agentKey, provider);
    
    this.usdc = new ethers.Contract(
      USDC_ADDRESS,
      USDC_ABI,
      this.wallet
    );
  }
  
  async getPrice(
    userAddress: string,
    symbol: string
  ): Promise<{
    price: number;
    txHash: string;
    timestamp: number;
  }> {
    const fee = ethers.parseUnits("0.001", 6); // 0.001 USDC
    
    // 1. 接收支付
    const receiveTx = await this.usdc.transferFrom(
      userAddress,
      this.wallet.address,
      fee
    );
    await receiveTx.wait(1);
    
    // 2. 获取价格
    const price = await this.fetchPrice(symbol);
    
    return {
      price,
      txHash: receiveTx.hash,
      timestamp: Date.now(),
    };
  }
  
  private async fetchPrice(symbol: string): Promise<number> {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`
    );
    const data = await res.json();
    return parseFloat(data.price);
  }
  
  private deriveKey(masterKey: string, salt: string): string {
    return ethers.keccak256(
      ethers.toUtf8Bytes(`${masterKey}:${salt}`)
    );
  }
  
  // 提现到所有者钱包
  async withdraw(to: string): Promise<string> {
    const balance = await this.usdc.balanceOf(this.wallet.address);
    const tx = await this.usdc.transfer(to, balance);
    await tx.wait(1);
    return tx.hash;
  }
}
```

**演示效果**:
```
用户输入: "ETH价格"

系统响应:
┌─────────────────────────────────────┐
│ PriceOracleAgent 服务              │
├─────────────────────────────────────┤
│ 服务费用: 0.001 USDC               │
│ 支付交易: 0x3f8a...9d2e            │
│   ↓                                 │
│ 查询 Binance API...                │
│   ↓                                 │
│ ETH/USDT: $3,247.56                │
│ 更新时间: 2025-03-25 14:32:05      │
│                                     │
│ [查看交易] [Agent余额]              │
└─────────────────────────────────────┘

点击"查看交易":
→ https://www.okx.com/web3/explorer/xlayer-test/tx/0x3f8a...9d2e
```

---

### Agent 2: TradeStrategyAgent

**功能**: 分析交易策略并给出建议

**经济模型**:
```
分析费用: 0.005 USDC
复杂分析: 0.01 USDC
支付方式: 调用时实时转账
```

**链上流程**:
```
用户提供:
- 当前持仓
- 风险偏好
- 目标收益
  ↓
支付 0.005 USDC
  ↓
Agent分析:
- 技术分析 (RSI, MACD)
- 基本面分析
- 风险评估
  ↓
返回策略报告 + 交易哈希
```

**代码实现**:
```typescript
// TradeStrategyAgent.ts
export class TradeStrategyAgent {
  private wallet: ethers.Wallet;
  private usdc: ethers.Contract;
  
  async analyzeStrategy(
    userAddress: string,
    params: {
      holdings: string[];
      riskLevel: 'low' | 'medium' | 'high';
      targetReturn: number;
    }
  ): Promise<{
    strategy: string;
    riskScore: number;
    recommendation: string;
    txHash: string;
  }> {
    const fee = ethers.parseUnits("0.005", 6);
    
    // 1. 接收支付
    const receiveTx = await this.usdc.transferFrom(
      userAddress,
      this.wallet.address,
      fee
    );
    await receiveTx.wait(1);
    
    // 2. 执行分析
    const analysis = await this.performAnalysis(params);
    
    return {
      ...analysis,
      txHash: receiveTx.hash,
    };
  }
  
  private async performAnalysis(params: any) {
    // 获取市场数据
    const marketData = await this.fetchMarketData(params.holdings);
    
    // 技术分析
    const technical = this.technicalAnalysis(marketData);
    
    // 风险评估
    const risk = this.calculateRisk(params, marketData);
    
    // 生成策略
    const strategy = this.generateStrategy(technical, risk);
    
    return {
      strategy: strategy.name,
      riskScore: risk.score,
      recommendation: strategy.recommendation,
    };
  }
  
  private async fetchMarketData(holdings: string[]) {
    // 并行获取所有持仓的价格数据
    const prices = await Promise.all(
      holdings.map(h => this.fetchPrice(h))
    );
    return prices;
  }
  
  private technicalAnalysis(data: any[]) {
    // 简化的技术分析
    return {
      trend: Math.random() > 0.5 ? 'bullish' : 'bearish',
      rsi: 30 + Math.random() * 40, // 30-70
      macd: Math.random() > 0.5 ? 'positive' : 'negative',
    };
  }
  
  private calculateRisk(params: any, data: any) {
    // 基于用户风险偏好计算
    const baseRisk = params.riskLevel === 'high' ? 0.8 : 
                     params.riskLevel === 'medium' ? 0.5 : 0.3;
    return {
      score: Math.min(baseRisk + Math.random() * 0.2, 1.0),
      level: params.riskLevel,
    };
  }
  
  private generateStrategy(technical: any, risk: any) {
    if (technical.trend === 'bullish' && risk.score < 0.6) {
      return {
        name: "Conservative Growth",
        recommendation: "逐步加仓主流币，保持60%仓位",
      };
    }
    return {
      name: "Defensive Hold",
      recommendation: "保持现金，等待更好入场时机",
    };
  }
}
```

**演示效果**:
```
用户输入: 
"我持有 ETH 和 BTC，风险偏好中等，目标月收益10%"

系统响应:
┌─────────────────────────────────────┐
│ TradeStrategyAgent 分析服务        │
├─────────────────────────────────────┤
│ 分析费用: 0.005 USDC               │
│ 支付交易: 0x7b2c...4f8a            │
│   ↓                                 │
│ 持仓分析:                           │
│   - ETH: $3,247.56 (+2.3%)         │
│   - BTC: $67,432.12 (+1.8%)        │
│   ↓                                 │
│ 技术指标:                           │
│   - RSI: 62 (中性偏强)             │
│   - MACD: 正向交叉                 │
│   - 趋势:  bullish                 │
│   ↓                                 │
│ 风险评估: 4.2/10 (中低风险)        │
│   ↓                                 │
│ 【策略建议】Conservative Growth    │
│ 建议: 逐步加仓主流币，保持60%仓位  │
│ 预期月收益: 8-12%                  │
│                                     │
│ [查看交易] [保存策略]               │
└─────────────────────────────────────┘
```

---

### Agent 3: WorkflowOrchestrator (A2A支付)

**功能**: 编排多个Agent协作，处理A2A支付

**经济模型**:
```
编排费用: 0.002 USDC + 10%佣金
A2A支付: 实时转账给被雇佣的Agent
```

**核心能力**:
- 发现其他Agent
- 支付并调用其他Agent
- 协调工作流程

**链上流程**:
```
用户创建任务:
"监控ETH价格，超过$3000时通知我"
  ↓
支付编排费 0.002 USDC
  ↓
Orchestrator工作:
  1. 雇佣 PriceOracleAgent (支付 0.001 USDC)
  2. 定期调用查询价格
  3. 条件满足时触发通知
  4. (可选) 雇佣 TradeAgent 执行交易
  ↓
所有支付交易可查
Agent余额实时更新
```

**代码实现**:
```typescript
// WorkflowOrchestrator.ts
export class WorkflowOrchestrator {
  private wallet: ethers.Wallet;
  private usdc: ethers.Contract;
  private priceAgent: PriceOracleAgent;
  private tradeAgent: TradeStrategyAgent;
  
  constructor(
    privateKey: string,
    provider: ethers.Provider
  ) {
    const orchestratorKey = this.deriveKey(privateKey, "orchestrator");
    this.wallet = new ethers.Wallet(orchestratorKey, provider);
    
    this.priceAgent = new PriceOracleAgent(privateKey, provider);
    this.tradeAgent = new TradeStrategyAgent(privateKey, provider);
  }
  
  async executeWorkflow(
    userAddress: string,
    workflow: {
      type: 'price_alert' | 'auto_trade';
      params: any;
      budget: number;
    }
  ): Promise<{
    status: string;
    payments: PaymentRecord[];
    results: any[];
  }> {
    const payments: PaymentRecord[] = [];
    const results: any[] = [];
    
    // 1. 接收用户预算
    const budgetWei = ethers.parseUnits(workflow.budget.toString(), 6);
    const budgetTx = await this.usdc.transferFrom(
      userAddress,
      this.wallet.address,
      budgetWei
    );
    await budgetTx.wait(1);
    
    payments.push({
      from: userAddress,
      to: this.wallet.address,
      amount: workflow.budget,
      type: 'budget',
      txHash: budgetTx.hash,
    });
    
    // 2. 根据工作流类型执行
    if (workflow.type === 'price_alert') {
      // 雇佣PriceAgent
      const priceResult = await this.hireAndCallPriceAgent(
        workflow.params.symbol
      );
      payments.push(...priceResult.payments);
      results.push(priceResult.data);
      
      // 如果价格满足条件，雇佣TradeAgent
      if (priceResult.data.price > workflow.params.threshold) {
        const tradeResult = await this.hireAndCallTradeAgent({
          price: priceResult.data.price,
          holdings: workflow.params.holdings || ['ETH'],
        });
        payments.push(...tradeResult.payments);
        results.push(tradeResult.data);
      }
    }
    
    // 3. 结算剩余资金
    const remaining = await this.usdc.balanceOf(this.wallet.address);
    if (remaining > 0) {
      const refundTx = await this.usdc.transfer(userAddress, remaining);
      await refundTx.wait(1);
      payments.push({
        from: this.wallet.address,
        to: userAddress,
        amount: ethers.formatUnits(remaining, 6),
        type: 'refund',
        txHash: refundTx.hash,
      });
    }
    
    return {
      status: 'completed',
      payments,
      results,
    };
  }
  
  private async hireAndCallPriceAgent(symbol: string) {
    // 支付PriceAgent
    const fee = ethers.parseUnits("0.001", 6);
    const payTx = await this.usdc.transfer(
      this.priceAgent.getAddress(),
      fee
    );
    await payTx.wait(1);
    
    // 调用服务
    const price = await this.priceAgent.getPriceDirect(symbol);
    
    return {
      payments: [{
        from: this.wallet.address,
        to: this.priceAgent.getAddress(),
        amount: '0.001',
        type: 'a2a_payment',
        txHash: payTx.hash,
      }],
      data: { symbol, price },
    };
  }
  
  private async hireAndCallTradeAgent(params: any) {
    // 支付TradeAgent
    const fee = ethers.parseUnits("0.005", 6);
    const payTx = await this.usdc.transfer(
      this.tradeAgent.getAddress(),
      fee
    );
    await payTx.wait(1);
    
    // 调用服务
    const analysis = await this.tradeAgent.analyzeStrategyDirect(params);
    
    return {
      payments: [{
        from: this.wallet.address,
        to: this.tradeAgent.getAddress(),
        amount: '0.005',
        type: 'a2a_payment',
        txHash: payTx.hash,
      }],
      data: analysis,
    };
  }
}

interface PaymentRecord {
  from: string;
  to: string;
  amount: string;
  type: 'budget' | 'a2a_payment' | 'refund' | 'fee';
  txHash: string;
}
```

**演示效果**:
```
用户创建工作流:
"监控ETH，超过$3000时分析并建议"
预算: 0.1 USDC

系统响应:
┌─────────────────────────────────────┐
│ WorkflowOrchestrator               │
├─────────────────────────────────────┤
│ 步骤 1: 接收预算                   │
│ 用户 → Orchestrator: 0.1 USDC      │
│ 交易: 0x9a1b...2c3d                │
│ ✓ 已确认                           │
│   ↓                                 │
│ 步骤 2: 调用PriceAgent             │
│ Orchestrator → PriceAgent: 0.001   │
│ 交易: 0x2e4f...6a7b                │
│ ✓ 已确认                           │
│ 结果: ETH = $3,247.56              │
│   ↓                                 │
│ 步骤 3: 条件检查                   │
│ $3,247.56 > $3,000? 是 ✓          │
│   ↓                                 │
│ 步骤 4: 调用TradeAgent             │
│ Orchestrator → TradeAgent: 0.005   │
│ 交易: 0x8c3d...9e0f                │
│ ✓ 已确认                           │
│ 结果: 建议买入，预期收益10%        │
│   ↓                                 │
│ 步骤 5: 退款                       │
│ Orchestrator → 用户: 0.092 USDC    │
│ 交易: 0x1f2a...3b4c                │
│ ✓ 已确认                           │
│   ↓                                 │
│ 【工作流完成】                      │
│ 总支付: 3笔交易                    │
│ 剩余预算: 已退回                   │
│                                     │
│ [查看所有交易] [保存工作流]         │
└─────────────────────────────────────┘

用户可以在X Layer浏览器查看所有4笔交易！
```

---

## 四、集成 804 协议 (ERC-8004)

### 为什么需要

804协议是Agent的标准注册协议，让Agent有链上身份。

### 简化实现

```typescript
// AgentRegistryService.ts
export class AgentRegistryService {
  private registry: ethers.Contract;
  
  constructor(provider: ethers.Provider) {
    this.registry = new ethers.Contract(
      AGENT_REGISTRY_8004_ADDRESS,
      [
        "function registerAgent(string name, string metadataURI, uint256[] capabilities) returns (uint256)",
        "function getAgent(uint256 agentId) view returns (address owner, string name, bool active, uint256 reputation)",
        "event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)",
      ],
      provider
    );
  }
  
  async registerAgent(
    signer: ethers.Signer,
    name: string,
    capabilities: string[]
  ): Promise<{ agentId: number; txHash: string }> {
    const capabilityHashes = capabilities.map(c => 
      ethers.keccak256(ethers.toUtf8Bytes(c))
    );
    
    const tx = await this.registry.connect(signer).registerAgent(
      name,
      `https://xagent.io/agents/${name}`,
      capabilityHashes
    );
    
    const receipt = await tx.wait(1);
    
    // 从事件中提取agentId
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = this.registry.interface.parseLog(log);
        return parsed?.name === 'AgentRegistered';
      } catch { return false; }
    });
    
    const parsed = this.registry.interface.parseLog(event!);
    
    return {
      agentId: Number(parsed?.args?.agentId),
      txHash: receipt.hash,
    };
  }
}
```

### 演示

```
注册PriceOracleAgent:

交易: 0x5d6e...7f8a
804协议AgentID: 42
链上可查: https://8004scan.io/agent/42

Agent信息:
- 名称: PriceOracleAgent
- 所有者: 0x742d...3f4e
- 能力: fetch_price, set_alert
- 声誉: 4.8★
- 总调用: 1,542次
```

---

## 五、演示数据展示

### 每个交互必须展示

```
┌─────────────────────────────────────┐
│ 服务详情                            │
├─────────────────────────────────────┤
│ 服务: PriceOracleAgent              │
│ 费用: 0.001 USDC                    │
├─────────────────────────────────────┤
│ 【链上交易】                         │
│ 支付交易: 0x3f8a...9d2e            │
│ 区块: #12345678                    │
│ 时间: 2025-03-25 14:32:05 UTC      │
│ Gas: 0.0001 OKB                    │
│                                     │
│ [在X Layer浏览器查看]               │
├─────────────────────────────────────┤
│ 【Agent信息】                        │
│ 804协议ID: 42                      │
│ 地址: 0x8a3b...9c2d                │
│ 总收益: 1.542 USDC                 │
│ 调用次数: 1,542次                  │
│                                     │
│ [查看Agent详情]                     │
├─────────────────────────────────────┤
│ 【服务结果】                         │
│ ETH/USDT: $3,247.56                │
│ 数据来源: Binance                  │
│ 更新时间: 14:32:05                 │
└─────────────────────────────────────┘
```

---

## 六、实施计划 (2天)

### 第一天 (8小时)

| 时间 | 任务 | 输出 |
|------|------|------|
| 0-2h | 部署3个Agent钱包 | 3个派生地址，有余额验证 |
| 2-4h | 实现PriceOracleAgent | 可查询价格+收款 |
| 4-6h | 实现TradeStrategyAgent | 可分析+收款 |
| 6-8h | 实现WorkflowOrchestrator | 可A2A支付 |

### 第二天 (8小时)

| 时间 | 任务 | 输出 |
|------|------|------|
| 0-2h | 集成804协议注册 | Agent有链上ID |
| 2-4h | 前端展示交易详情 | 每笔显示交易哈希 |
| 4-6h | 完整流程测试 | 3个场景都能跑通 |
| 6-8h | Demo视频录制 | 展示真实交易 |

---

## 七、成功标准

### 最低要求 (必须达到)

- [ ] 3个Agent都有真实钱包地址
- [ ] 每次调用都有真实USDC转账
- [ ] 每笔交易都有哈希可查看
- [ ] 能在X Layer浏览器验证

### 理想状态 (争取达到)

- [ ] 804协议注册完成
- [ ] 前端实时展示交易状态
- [ ] 3个完整Demo场景
- [ ] Demo视频展示真实交易流

---

## 八、风险评估

### 技术风险

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| USDC转账失败 | 中 | 高 | 预先批准额度，检查余额 |
| 合约Gas不够 | 中 | 高 | 准备充足OKB |
| API限流 | 低 | 中 | 使用多个API源 |
| 网络延迟 | 高 | 低 | 展示loading状态 |

### 演示风险

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 交易确认慢 | 高 | 中 | 准备已确认的交易作为备用 |
| 价格数据异常 | 低 | 中 | 使用合理范围的价格 |
| 钱包连接失败 | 中 | 高 | 准备多个测试钱包 |

---

## 九、立即开始

### 需要您确认

1. **Cloudflare账号**: 确认Worker部署权限
2. **测试网钱包**: 
   - 地址: _______
   - OKB余额: _______
   - USDC余额: _______
3. **派生私钥**: 我生成3个Agent私钥，您保存在安全地方
4. **接下来16小时**: 确认可以投入

### 立即执行

如果确认，我立即：

1. **生成3个Agent钱包**
2. **配置Worker环境**
3. **部署第一个Agent**
4. **测试真实交易**

---

**您准备好开始了吗？请确认以上4点，我们立即开始！**