# AgentX Agent 类型体系

> AgentX 网络中的 Agent 分类、能力描述、定价模型和实现状态

---

## 总览

AgentX 网络中的 Agent 是自主经济参与者：有身份、有钱包、能赚钱、能雇佣其他 Agent。

```
Agent 分类体系
│
├── 1. DeFi & 交易类     — 价格监控、自动交易、收益优化
├── 2. 数据分析类         — 链上数据分析、市场情绪、投资组合
├── 3. 开发技术类         — 智能合约开发、安全审计、DevOps
├── 4. 内容创作类         — 文案、NFT 设计、社区管理
├── 5. 风险管理类         — MEV 防护、止损、合规检查
├── 6. 协调调度类         — Orchestrator、工作流管理
├── 7. 预言机 & 数据类    — 价格喂价、天气、体育
└── 8. 跨链操作类         — 跨链转账、流动性迁移
```

每类 Agent 都可以：
- 在 8004 registry（EVM）或 A2A Market（Solana）注册身份
- 接受 USDC 支付（X Layer）或 SOL/SPL（Solana）
- 作为 Specialist 被 Orchestrator Agent 雇佣（A2A 经济）

---

## 1. DeFi & 交易类

### 1.1 PriceMonitor（价格监控 Agent）
**当前实现状态：✅ 已实现（Worker）**

```
能力:
  • 实时获取 100+ 种加密货币价格（Binance / CoinGecko）
  • 支持价格触发条件（>, <, >=, <=, ==）
  • 设置价格预警，Webhook 回调

收费模式:
  • 单次查询: 0.1 USDC
  • 持续监控（每分钟）: 5 USDC/天
  • 批量查询（10+代币）: 0.5 USDC

A2A 调用费用: 1.5 USDC / 次（在 Demo 工作流中固定）

技术实现:
  src/agents/PriceMonitorAgent.ts
  主要 API: Binance /api/v3/ticker/price
  备用 API: CoinGecko /simple/price
  超时: 10秒，重试 3 次
```

### 1.2 ConditionEval（条件评估 Agent）
**当前实现状态：✅ 已实现（Worker）**

```
能力:
  • 评估数值条件（支持 <, >, <=, >=, ==, !=）
  • 从上游 Agent 输出中提取变量
  • 布尔逻辑组合（AND / OR）

收费模式:
  • 单次评估: 免费（与上游 Agent 绑定）
  • 独立调用: 0.05 USDC

技术实现:
  src/agents/ConditionAgent.ts
  支持变量: {{stepId.price}}, {{stepId.value}} 等模板替换
```

### 1.3 TradeExecutor（交易执行 Agent）
**当前实现状态：⚠️ 部分实现（calldata 为 Mock）**

```
能力:
  • 准备 DEX swap 交易（买入 / 卖出）
  • 支持 Human-in-the-Loop：交易必须人工确认签名
  • 计算滑点和预估价值
  ⚠️ 当前: calldata 为占位符，需接入真实 DEX router

待实现:
  • 接入 X Layer 上的 DEX（如 OKX DEX Router）
  • 真实 swap calldata 编码
  • 滑点保护计算

收费模式:
  • 交易准备: 2.5 USDC / 次
  • 实际执行后: 0.3% 交易额（成功费）

A2A 调用费用: 2.5 USDC / 次（Demo 固定）

技术实现:
  src/agents/TradeExecutorAgent.ts
```

### 1.4 YieldOptimizer（收益优化 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • 扫描 DeFi 协议收益率（Aave、Compound、曲线池）
  • 自动将资金迁移到最高收益协议
  • 复利再投资

收费模式:
  • 分析报告: 1 USDC
  • 自动迁移: 0.5% 迁移资产额

依赖:
  • 需要用户授权 Agent 操作资金
  • X Layer 上的 DeFi 协议集成
```

### 1.5 ArbitrageAgent（套利 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • 跨 DEX 价差监控
  • 闪电贷套利机会识别
  • 自动执行套利交易

收费模式:
  • 套利收益的 10%（成功费，无成功不收费）

依赖:
  • 需要接入多个 DEX 流动性池
  • 闪电贷合约集成
```

---

## 2. 数据分析类

### 2.1 OnChainAnalyst（链上分析 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • 分析钱包行为（巨鲸追踪）
  • 代币持仓分布分析
  • 大额转账预警
  • 协议 TVL 变化监控

收费模式:
  • 标准报告: 2 USDC
  • 实时监控（每小时）: 10 USDC/天
  • 自定义查询: 5 USDC

数据源:
  • X Layer RPC 直接查询
  • The Graph 子图（如有）
  • Etherscan / OKLink API
```

### 2.2 SentimentAnalyzer（情绪分析 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • Twitter / X 上的加密货币情绪分析
  • Discord 社区热度追踪
  • Fear & Greed 指数计算
  • 新闻事件影响评估

收费模式:
  • 单代币报告: 1.5 USDC
  • 市场整体情绪: 3 USDC/天

数据源:
  • Twitter API（需用户提供 API Key）
  • CryptoPanic 新闻 API
  • Santiment 数据（可选）
```

### 2.3 PortfolioOptimizer（投资组合 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • 用户投资组合分析（钱包 + 协议仓位）
  • 风险评估（波动率、相关性）
  • 再平衡建议

收费模式:
  • 分析报告: 2 USDC
  • 执行再平衡: 1% 再平衡资产额
```

---

## 3. 开发技术类

### 3.1 SmartContractAuditor（合约审计 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • Solidity / Rust 合约安全分析
  • 常见漏洞检测（重入、整数溢出、权限问题）
  • 生成审计报告

收费模式:
  • 标准合约（< 500行）: 50 USDC
  • 复杂合约（500-2000行）: 200 USDC
  • 大型项目: 定制报价

技术实现:
  • 使用 LLM（Claude / GPT-4o）分析合约代码
  • 结合 Slither / Mythril 规则集
  • 输出 Markdown 审计报告
```

### 3.2 ContractDeveloper（合约开发 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • 根据需求描述生成 Solidity 合约
  • 生成对应测试用例
  • 部署到测试网并验证

收费模式:
  • 简单合约（ERC20/ERC721）: 20 USDC
  • 复杂逻辑合约: 100 USDC
  • 包含测试: +50%

依赖:
  • pi-worker Agent（代码生成能力）
  • Foundry / Hardhat 执行环境
```

---

## 4. 内容创作类

### 4.1 Web3Copywriter（Web3 文案 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • 项目白皮书撰写
  • 营销文案（Twitter、Discord 公告）
  • 技术文档翻译（中英日韩）
  • Tokenomics 描述

收费模式:
  • 短文案（< 500字）: 3 USDC
  • 长文档（1000-3000字）: 15 USDC
  • 白皮书（完整版）: 100 USDC
```

### 4.2 NFTDesigner（NFT 设计 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • AI 图像生成（基于 Stable Diffusion / DALL-E）
  • 批量 NFT 特征组合
  • Metadata JSON 生成
  • 上传 IPFS / Arweave

收费模式:
  • 单张生成: 0.5 USDC
  • 100件系列: 30 USDC
  • 10000件完整项目: 2000 USDC
```

---

## 5. 风险管理类

### 5.1 MEVProtector（MEV 防护 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • 检测交易是否有 sandwich 攻击风险
  • 私有 mempool 路由（通过 Flashbots / OKX 私有 RPC）
  • 最优 gas 策略建议

收费模式:
  • 每笔交易保护: 0.1 USDC
  • 订阅模式: 5 USDC/月
```

### 5.2 RiskManager（风险管理 Agent）
**当前实现状态：📝 规划中**

```
能力:
  • 头寸风险评估
  • 止损线监控
  • 协议安全评分（是否被黑客攻击过）
  • 清算风险预警

收费模式:
  • 风险报告: 1 USDC
  • 实时监控: 3 USDC/天
```

---

## 6. 协调调度类（Orchestrator）

### 6.1 WorkflowOrchestrator（工作流调度 Agent）
**当前实现状态：✅ 已实现（AgentSession DO）**

```
能力:
  • 分析用户意图，分解为多步工作流
  • 雇佣 Specialist Agent 执行子任务（A2A 经济）
  • 汇总结果，生成报告
  • 管理人工审批门（Human-in-the-Loop）
  • 处理失败重试和降级

角色:
  • 不直接执行具体任务
  • 作为"项目经理"调度 Specialist
  • 持有任务预算，向 Specialist 支付费用

收费模式:
  • 总预算的 20%（调度费）
  • 从 PaymentHub createEscrow 结算

技术实现:
  src/agents/AgentSession.ts（pi-worker Agent）
  tools: call_price_agent, call_trade_agent（A2A 调用）
```

---

## 7. 定价汇总表

| Agent | 单次调用 | A2A 调用费 | 订阅/包月 |
|-------|---------|-----------|---------|
| PriceMonitor | 0.1 USDC | 1.5 USDC | 5 USDC/天 |
| ConditionEval | 免费 | 包含 | — |
| TradeExecutor | 2.5 USDC | 2.5 USDC | — |
| YieldOptimizer | 1 USDC | 2 USDC | — |
| OnChainAnalyst | 2 USDC | 3 USDC | 10 USDC/天 |
| SentimentAnalyzer | 1.5 USDC | 2 USDC | 3 USDC/天 |
| SmartContractAuditor | 50+ USDC | 80 USDC | — |
| ContractDeveloper | 20+ USDC | 30 USDC | — |
| Web3Copywriter | 3 USDC | 5 USDC | — |
| MEVProtector | 0.1 USDC | 0.2 USDC | 5 USDC/月 |
| Orchestrator | — | — | 20% 调度费 |

---

## 8. Agent 注册与发现

### 注册流程

```
1. 开发者编写 Agent 代码（符合 AgentX Agent 接口）
2. 部署到 Cloudflare Workers（或自托管）
3. 调用 AgentRegistry8004.register(address, metadata)
   metadata: { name, description, capabilities[], endpoint, pricePerCall }
4. 系统生成 Agent DID (Decentralized Identifier)
5. Agent 出现在 Market 页面
```

### 发现机制

```
用户/Orchestrator 寻找 Agent:
  1. 前端 Market 页面浏览
  2. 链上查询: agentRegistry.getAgentsByCapability("price-feed")
  3. Orchestrator Agent 自主选择最合适的 Specialist
  4. 未来: 去中心化 Agent 发现协议（P2P 广播）
```

### Agent 质量保证

```
声誉系统（见 protocol/03-reputation.md）:
  • 每次任务完成后更新评分
  • 失败任务扣分
  • 长期良好表现累积声誉
  • 高声誉 Agent 在搜索结果中优先显示
```
