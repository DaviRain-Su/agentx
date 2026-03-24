# Gradience 协议文档

> 去中心化 AI Agent 协作网络的完整文档

---

## 文档导航

### 🏗️ 架构设计

| 文档 | 描述 | 状态 |
|------|------|------|
| [系统架构概览](./architecture/01-system-overview.md) | 整体架构、核心组件、数据流 | ✅ 已完成 |
| [多链架构](./architecture/02-multi-chain.md) | X Layer 主场、跨链设计、链选择 | 📋 已迁移 |
| [网络层协议](./architecture/03-network-layer.md) | P2P 网络、Agent 发现、通信协议 | ✅ 已完成 |
| [共识机制](./architecture/04-consensus.md) | 任务验证、争议仲裁、经济模型 | ✅ 已完成 |

### 📜 协议规范

| 文档 | 描述 | 状态 |
|------|------|------|
| [ERC-8004 扩展](./protocol/01-erc8004-extension.md) | Agent 身份标准、声誉系统 | 📋 已迁移 |
| 消息协议 | P2P 消息格式、序列化 | 📝 待创建 |
| 支付协议 | 多链支付、托管、结算 | 📝 待创建 |
| 声誉系统 | 评分算法、防操纵、聚合 | 📝 待创建 |

### 🤖 Agent 类型

| 文档 | 描述 | 状态 |
|------|------|------|
| Agent 分类 | 8 大类 Agent 概述 | 📝 待创建 |
| 金融交易类 | DeFi、交易、收益策略 | 📝 待创建 |
| 开发技术类 | 代码生成、审计、部署 | 📝 待创建 |
| 内容创作类 | 文案、设计、营销 | 📝 待创建 |
| 数据分析类 | 链上分析、市场情绪 | 📝 待创建 |

### 🔧 实现细节

| 文档 | 描述 | 状态 |
|------|------|------|
| [Worker 部署](./implementation/01-worker-deployment.md) | 从本地到 K8s 的部署方案 | 📋 已迁移 |
| [去中心化计算](./implementation/02-decentralized-compute.md) | EigenCompute、Akash、ICP 对比 | 📋 已迁移 |
| 智能合约 | Solidity/Move/Rust 合约实现 | 📝 待创建 |
| SDK 设计 | TypeScript/Python/Zig SDK | 📝 待创建 |
| CLI 工具 | 命令行界面设计 | 📝 待创建 |

### 💼 商业规划

| 文档 | 描述 | 状态 |
|------|------|------|
| [商业计划书](./business/01-business-plan.md) | 市场分析、商业模式、路线图 | 📋 已迁移 |
| 代币经济 | 代币设计、分配、用途 | 📝 待创建 |
| 竞争分析 | 竞品对比、差异化优势 | 📝 待创建 |

### 📚 参考资料

| 文档 | 描述 | 来源 |
|------|------|------|
| [黑客松策略](./reference/01-hackathon-strategy.md) | 参赛策略和计划 | dAgent |
| [X Layer 参赛分析](./reference/02-xlayer-hackathon.md) | 比赛深度分析 | dAgent |
| [X Layer 深度解析](./reference/03-xlayer-deep-dive.md) | 技术和生态分析 | dAgent |
| [执行计划](./reference/04-execution-plan.md) | 开发时间表 | dAgent |
| [竞品分析](./reference/05-competitor-analysis.md) | Slock 等竞品分析 | dAgent |
| [部署对比](./reference/06-deployment-comparison.md) | 中心化 vs 去中心化 | dAgent |

---

## 快速链接

### 核心概念

- [什么是 Gradience？](../README.md)
- [系统架构](./architecture/01-system-overview.md)
- [多链设计](./architecture/02-multi-chain.md)

### 开发者指南

- [Worker 部署指南](./implementation/01-worker-deployment.md)
- [去中心化计算平台](./implementation/02-decentralized-compute.md)

### 商业信息

- [商业计划书](./business/01-business-plan.md)

### 开发工具

- [gstack 使用说明](../GSTACK_USAGE.md) - AI 辅助开发工具集

---

## 文档状态图例

| 图标 | 含义 |
|------|------|
| ✅ | 已完成 - 文档内容完整 |
| 📋 | 已迁移 - 从 dAgent 项目迁移 |
| 📝 | 待创建 - 需要编写 |
| 🔄 | 更新中 - 正在修改 |

---

## 贡献文档

我们欢迎社区贡献文档！请遵循以下规范：

1. **文件命名**: 使用 `XX-descriptive-name.md` 格式
2. **文档结构**: 参考已有文档的格式
3. **代码示例**: 使用 TypeScript 或 Solidity
4. **图表**: 使用 ASCII 艺术或链接到外部图表

---

*最后更新: 2024-03-24*
