# Gradience 协议设计路线图 (ROADMAP)

> 长期协议设计规划 | 黑客松进度已同步 | 最后更新: 2025-03-25

---

## 🚀 黑客松冲刺状态 (3/25 - 4/3)

| 链 | 截止时间 | 状态 | 关键交付 |
|----|---------|------|---------|
| **X Layer** | 3/26 | 🔥 冲刺中 | Price Alert Workflow 端到端演示 |
| **Solana** | 4/3 | ⏳ 延期 | A2A Market + Token Launch |

**当前 BLOCKING**: 合约连接层修复 → Create Task 流程 → Worker 部署

详情查看: [`HACKATHON_SPRINT.md`](../HACKATHON_SPRINT.md)

---

## 🔴 高优先级 (核心协议)

### 协议规范

- [ ] **消息协议详细设计** (`protocol/02-messaging.md`)
  - [ ] Protobuf 消息定义完整规范
  - [ ] 消息序列化/反序列化
  - [ ] 消息加密和签名
  - [ ] 消息路由和转发
  - [ ] 消息确认和重传机制
  - **状态**: 设计阶段 (非黑客松重点)

- [x] **支付协议设计** (`protocol/03-payment.md`) 🏃 **黑客松中**
  - [x] 托管合约详细设计 (PaymentHub 已部署)
  - [ ] 多链支付路由 (Solana x402 待完成)
  - [ ] 即时支付 vs 托管支付选择逻辑
  - [ ] 跨链桥接集成
  - [ ] 费用计算和分配
  - **状态**: X Layer 托管完成, Solana x402 进行中

- [ ] **声誉系统详细设计** (`protocol/04-reputation.md`)
  - [ ] 评分算法数学模型
  - [ ] 声誉聚合公式
  - [ ] 防操纵机制
  - [ ] 跨链声誉同步
  - [ ] 声誉衰减和恢复
  - **状态**: Solana 基础合约已完成 (`reputation.rs`)

### 智能合约

- [x] **AgentRegistry 合约** 🏃 **黑客松中**
  - [x] ERC-8004 兼容 (使用 Charlie Registry 0x8004...)
  - [ ] 多链地址绑定
  - [x] 元数据管理
  - [ ] 权限控制
  - **状态**: X Layer 集成外部 Registry; Solana 程序已完成

- [x] **TaskManager 合约** ✅ **已完成**
  - [x] 任务生命周期管理
  - [x] 任务匹配逻辑
  - [x] 状态机设计
  - [x] 事件定义
  - **实现**: `packages/xlayer-adapter/contracts/TaskManager.sol`
  - **部署**: X Layer Testnet `0x3922...`

- [x] **PaymentHub 合约** ✅ **已完成**
  - [ ] 多代币支持 (当前仅 USDC)
  - [x] 托管逻辑 (基础版)
  - [ ] 批量支付
  - [ ] 紧急释放
  - **实现**: `packages/xlayer-adapter/contracts/PaymentHub.sol`
  - **部署**: X Layer Testnet `0x6FAe...`

- [ ] **ReputationAggregator 合约**
  - [ ] 评分存储
  - [ ] 聚合计算
  - [ ] 跨链验证
  - **状态**: Solana 基础版本完成, EVM 版本待开发

- [ ] **DisputeResolution 合约**
  - [ ] 争议流程
  - [ ] 仲裁员管理
  - [ ] 投票机制
  - [ ] 资金分配
  - **状态**: 未开始 (Post-MVP)

---

## 🟡 中优先级 (实现细节)

### Agent 类型

- [ ] **Agent 分类概述** (`agents/01-categories.md`)
  - [ ] 8 大类 Agent 定义
  - [ ] 能力描述标准
  - [ ] 定价模型

- [x] **金融交易类 Agent** 🏃 **黑客松中**
  - [x] PriceMonitorAgent ✅
  - [x] ConditionAgent ✅
  - [x] TradeExecutionAgent ✅
  - [ ] DCAInvestor
  - [ ] YieldOptimizer
  - [ ] ArbitrageAgent
  - [ ] RiskManager
  - **实现**: `packages/worker-cloudflare/src/agents/`

- [ ] **开发技术类 Agent** (`agents/03-development.md`)
  - [ ] SmartContractDeveloper
  - [ ] FrontendArchitect
  - [ ] SecurityAuditor
  - [ ] DevOpsEngineer

- [ ] **内容创作类 Agent** (`agents/04-content.md`)
  - [ ] Web3Copywriter
  - [ ] NFTDesigner
  - [ ] CommunityManager

- [ ] **数据分析类 Agent** (`agents/05-analytics.md`)
  - [ ] OnChainAnalyst
  - [ ] MarketSentimentAnalyzer
  - [ ] PortfolioOptimizer

### 工作流引擎

- [x] **WorkflowEngine** ✅ **已完成**
  - [x] DAG 构建
  - [x] 拓扑排序
  - [x] Sequential Runner
  - [x] Parallel Runner
  - [x] Conditional Runner
  - [x] 状态管理
  - **实现**: `packages/shared-orchestrator/src/engine/`

- [x] **人在回路管理** ✅ **已完成**
  - [x] 确认管理器 (5分钟超时)
  - [x] 弹窗 UI
  - **实现**: `packages/shared-orchestrator/src/human-in-loop/`

### SDK 设计

- [ ] **TypeScript SDK** (`sdk/typescript/`)
  - [ ] 核心客户端
  - [ ] Agent 发现
  - [ ] 任务管理
  - [ ] 支付集成
  - **状态**: 前端代码可作为 SDK 基础 (`packages/xlayer-adapter/frontend/lib/`)

- [ ] **Python SDK** (`sdk/python/`)
  - [ ] 与 TypeScript SDK 功能对等
  - [ ] AI/ML 集成优化

- [ ] **Zig SDK** (`sdk/zig/`)
  - [ ] 高性能实现
  - [ ] 嵌入式设备支持

### CLI 工具

- [ ] **CLI 设计** (`docs/implementation/03-cli-design.md`)
  - [ ] 命令结构
  - [ ] 配置管理
  - [ ] 交互式向导

---

## 🟢 低优先级 (增强功能)

### 高级功能

- [ ] **隐私保护设计**
  - [ ] 零知识证明应用
  - [ ] 隐私路由
  - [ ] 匿名支付

- [ ] **分片设计**
  - [ ] 网络分片
  - [ ] 状态分片
  - [ ] 跨片通信

- [ ] **治理机制详细设计**
  - [ ] 投票权重计算
  - [ ] 委托投票
  - [ ] 提案模板

### 商业和生态

- [ ] **代币经济模型** (`business/02-token-economics.md`)
  - [ ] 代币分配
  - [ ] 通胀模型
  - [ ] 激励设计
  - **状态**: 当前纯 USDC 模式, 代币非必须

- [ ] **生态系统设计**
  - [ ] 开发者激励
  - [ ] 合作伙伴计划
  - [ ] Grants 项目

### 文档和工具

- [ ] **API 文档**
  - [ ] OpenAPI 规范
  - [ ] 交互式文档

- [x] **开发者教程** 🏃 **黑客松中**
  - [x] 快速开始 (IMPLEMENTATION_SPEC.md)
  - [ ] 最佳实践
  - [x] 示例项目 (MVP_4PHASES_ROADMAP.md)

---

## 📝 技术决策记录

### 已决策

| # | 决策 | 时间 | 状态 |
|---|------|------|------|
| 1 | 使用 Charlie 8004 Agent Registry (X Layer) | 3/23 | ✅ 已部署 |
| 2 | Solana 使用 Metaplex 标准 | 3/23 | ✅ 已确认 |
| 3 | Workflow 存储用 IPFS | 3/23 | ✅ 已确认 |
| 4 | X Layer 优先, Solana 延期至 4/3 | 3/25 | ✅ 已调整 |
| 5 | 纯 USDC 支付模式 (暂不发行代币) | 3/23 | ✅ 已确认 |

### 待讨论

1. **P2P 网络实现** - libp2p vs 自研?
2. **跨链方案** - LayerZero vs Wormhole vs Axelar?
3. **AI 执行环境** - TEE 的必要性?
4. **代币必要性** - 纯 USDC 模式长期可行性?

---

## ✅ 已完成清单

### 文档
- [x] 项目整体 README
- [x] 文档索引
- [x] 系统架构概览
- [x] 多链架构设计
- [x] 网络层协议设计
- [x] 共识机制设计
- [x] ERC-8004 扩展规范
- [x] Worker 部署指南
- [x] MVP 4阶段路线图
- [x] 实现规范文档 (Codex)
- [x] HACKATHON_SPRINT 计划

### 合约 (X Layer)
- [x] TaskManager.sol - 任务管理
- [x] PaymentHub.sol - 托管支付
- [x] 集成 Charlie 8004 Agent Registry

### 合约 (Solana)
- [x] agent_registry.rs - Agent 注册
- [x] a2a_market.rs - A2A 市场
- [x] reputation.rs - 声誉系统 (基础)

### 核心组件
- [x] WorkflowEngine - 工作流引擎
- [x] DAG Builder - DAG 构建器
- [x] 三种 Runner (Sequential/Parallel/Conditional)
- [x] 人在回路管理器
- [x] 状态管理器

### Agent (Worker)
- [x] PriceMonitorAgent
- [x] ConditionAgent
- [x] TradeExecutionAgent
- [x] RealAgent (Claude API 集成框架)

### 前端 (X Layer)
- [x] Next.js + OKX Connect 基础
- [x] 工作流配置界面
- [x] 人在回路弹窗
- [x] Agent Market 界面 (Mock)
- [x] Task 列表界面

### 前端 (Solana)
- [x] Next.js + Phantom 基础
- [x] A2A 市场界面 (Mock)
- [x] Agent Registry 界面

---

## 📅 优先级时间表 (更新版)

### Week 1 (3/23-3/29): 黑客松冲刺
- **3/26**: X Layer 提交 ⏰ 倒计时
- **3/27-3/29**: Solana 合约完善

### Week 2 (3/30-4/5): Solana 完成 + 优化
- **4/3**: Solana 提交 ⏰ 倒计时
- **4/4-4/5**: 双版本优化

### Week 3-4: 核心协议完善
- [ ] 消息协议详细设计
- [ ] 支付协议多链路由
- [ ] 声誉系统完善

### Week 5-6: Agent 生态系统
- [ ] Agent 分类标准化
- [ ] 金融类 Agent 扩展
- [ ] Agent 市场真实数据

### Week 7-8: SDK 和工具
- [ ] TypeScript SDK 发布
- [ ] CLI 工具
- [ ] 开发者文档完善

---

## 🔗 相关文档

| 文档 | 用途 | 链接 |
|------|------|------|
| HACKATHON_SPRINT.md | 短期冲刺执行 | [查看](../HACKATHON_SPRINT.md) |
| MVP_4PHASES_ROADMAP.md | MVP演示规划 | [查看](./MVP_4PHASES_ROADMAP.md) |
| IMPLEMENTATION_SPEC.md | 详细实现规范 | [查看](./IMPLEMENTATION_SPEC.md) |
| README.md | 项目总览 | [查看](../README.md) |

---

*最后更新: 2025-03-25 | 更新者: autoplan 审查流程*
