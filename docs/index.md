# Gradience 协议文档

> 去中心化 AI Agent 经济协议 — X Layer + Solana 双轨黑客松

---

## 🗺️ 快速导航

| 我想了解... | 去看 |
|-----------|------|
| 整个系统怎么工作 | [完整系统架构](./architecture/05-complete-system.md) |
| 哪些代码是 Mock，怎么改成真实的 | [前端实现任务单](./implementation/06-frontend-real-implementation.md) |
| A2A 支付怎么实现 | [A2A 协议规范](./implementation/03-a2a-protocol.md) |
| Codex 实现 Worker 端 | [Demo 任务单（Worker）](./implementation/04-demo-tasks.md) |
| 有哪些 Agent，怎么定价 | [Agent 类型体系](./agents/01-categories.md) |
| 代币要不要发 | [代币经济模型](./business/02-token-economics.md) |

---

## 🏗️ 架构设计

| 文档 | 描述 | 状态 |
|------|------|------|
| [系统架构概览](./architecture/01-system-overview.md) | 整体架构、核心组件、设计哲学 | ✅ |
| [多链架构](./architecture/02-multi-chain.md) | X Layer 主场、跨链设计、链选择逻辑 | ✅ |
| [网络层协议](./architecture/03-network-layer.md) | P2P 网络、Agent 发现、通信协议 | ✅ |
| [共识机制](./architecture/04-consensus.md) | 任务验证、争议仲裁、经济模型 | ✅ |
| [**完整系统架构（当前实现）**](./architecture/05-complete-system.md) | 真实代码结构图、Mock标注、接口契约、部署架构 | ✅ 黑客松版 |
| [团队协作架构](./architecture/05-team-collaboration.md) | 多 Agent 团队协作机制 | ✅ |
| [去中心化执行网络](./architecture/06-decentralized-execution-network.md) | 节点网络、执行验证 | ✅ |
| [TEE 执行环境](./architecture/07-tee-execution.md) | 可信执行环境设计 | ✅ |

---

## 📜 协议规范

| 文档 | 描述 | 状态 |
|------|------|------|
| [ERC-8004 扩展](./protocol/01-erc8004-extension.md) | Agent 身份标准、链上注册、声誉链接 | ✅ |
| [**支付协议**](./protocol/02-payment.md) | 双轨支付：PaymentHub 托管 + A2A 微支付 + x402 | ✅ |
| [**声誉系统**](./protocol/03-reputation.md) | 评分算法、防操纵、跨链同步、质押联动 | ✅ |

---

## 🤖 Agent 类型

| 文档 | 描述 | 状态 |
|------|------|------|
| [**Agent 类型完整体系**](./agents/01-categories.md) | 8大类Agent定义、能力、定价、实现状态 | ✅ |

**已实现的 Agent**（在 Worker 中）：
- ✅ `PriceMonitorAgent` — Binance/CoinGecko 实时价格
- ✅ `ConditionAgent` — 条件评估
- ⚠️ `TradeExecutorAgent` — 交易准备（calldata 为 Mock）
- ✅ `AgentSession` (Orchestrator) — pi-worker Agent，支持 A2A 工具调用

---

## 🔧 实现细节

| 文档 | 描述 | 状态 |
|------|------|------|
| [Worker 部署指南](./implementation/01-worker-deployment.md) | Cloudflare Worker 部署流程 | ✅ |
| [去中心化计算对比](./implementation/02-decentralized-compute.md) | EigenCompute、Akash、ICP 对比 | ✅ |
| [**A2A 经济协议规范**](./implementation/03-a2a-protocol.md) | 402支付流、wallet派生、完整工具代码 | ✅ 可交Codex |
| [**Demo 实现任务单（Worker）**](./implementation/04-demo-tasks.md) | 4个Worker任务，精确到文件行号 | ✅ 可交Codex |
| [**Agent 身份与钱包体系**](./implementation/05-agent-identity-wallet.md) | 现在（子钱包派生）vs 未来（OWS集成） | ✅ |
| [**前端 Mock→真实 任务单**](./implementation/06-frontend-real-implementation.md) | 6个前端任务，所有Mock的替换方案 | ✅ 可交Codex |

---

## 💼 商业规划

| 文档 | 描述 | 状态 |
|------|------|------|
| [商业计划书](./business/01-business-plan.md) | 市场分析、商业模式、路线图（早期版本） | ✅ |
| [**代币经济模型**](./business/02-token-economics.md) | GPC代币决策、分配、用途、竞品对比、融资路径 | ✅ |

---

## 📚 参考资料

| 文档 | 描述 |
|------|------|
| [黑客松策略](./reference/01-hackathon-strategy.md) | 参赛策略和计划 |
| [X Layer 参赛分析](./reference/02-xlayer-hackathon.md) | X Layer 比赛深度分析 |
| [X Layer 深度解析](./reference/03-xlayer-deep-dive.md) | 技术和生态分析 |
| [执行计划](./reference/04-execution-plan.md) | 开发时间表 |
| [竞品分析](./reference/05-competitor-analysis.md) | Slock 等竞品分析 |
| [部署对比](./reference/06-deployment-comparison.md) | 中心化 vs 去中心化部署 |

---

## 📋 提交材料

| 文档 | 说明 |
|------|------|
| [SUBMISSION.md](./SUBMISSION.md) | 黑客松提交文档（英文） |
| [IMPLEMENTATION_SPEC.md](./IMPLEMENTATION_SPEC.md) | 技术实现规格 |

---

## 合约地址（X Layer Testnet, Chain ID: 195）

| 合约 | 地址 |
|------|------|
| TaskManager | `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686` |
| PaymentHub | `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60` |
| USDC | `0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e` |
| AgentRegistry (8004) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |

---

## 图例

| 标记 | 含义 |
|------|------|
| ✅ | 文档完整，内容可用 |
| ⚠️ | 部分完成或有已知问题 |
| ❌ | 未实现 |
| 📝 | 规划中，尚未创建 |

---

*最后更新: 2026-03-25（黑客松 Sprint 版）*
