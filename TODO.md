# Gradience 双轨黑客松计划

> X Layer (3/26 截止) + Solana (3/27 截止)
> 最后更新: 2025-03-23

---

## 项目结构

```
gradience/
├── packages/
│   ├── shared-orchestrator/      # 共享核心
│   ├── xlayer-adapter/           # X Layer 适配
│   └── solana-adapter/           # Solana 适配
```

---

## Day 1 - 3月23日（周六）

### Phase 1: 共享核心 (0-4h) ✅ COMPLETED

- [x] **1.1** 初始化项目结构
- [x] **1.2** 定义核心类型 (Agent, Workflow, Payment)
- [x] **1.3** 实现 WorkflowEngine (DAG, 拓扑排序, 调度)
- [x] **1.4** 实现三种执行器 (Sequential, Parallel, Conditional)
- [x] **1.5** 实现人在回路管理器 (5分钟超时)

**产出:** `packages/shared-orchestrator/` 完整实现

### Phase 2: X Layer 合约 (4-8h) ✅ COMPLETED (架构调整)

**架构调整:** 使用 Charlie 的 8004 Agent Registry，专注工作流编排

- [x] **2.1** ~~AgentRegistry.sol~~ ❌ 删除（使用 Charlie 的 8004）
- [x] **2.2** TaskManager.sol ✅ 更新（移除 AgentRegistry 依赖）
- [x] **2.3** PaymentHub.sol ✅ 保留（USDC 托管/支付）
- [x] **2.4** 部署到 X Layer 测试网 ✅ TaskManager + PaymentHub 已部署

**产出:** 
- `TaskManager.sol` - 工作流编排核心
- `PaymentHub.sol` - USDC 支付托管
- 集成 Charlie 8004 Agent Registry（无需部署）

### Phase 3: X Layer 前端 + 集成 (8-12h) ✅ COMPLETED

- [x] **3.1** 初始化前端 (Next.js + OKX Connect)
- [x] **3.2** 工作流配置界面
- [x] **3.3** 人在回路弹窗
- [x] **3.4** 集成共享核心 (mockService + 链上轮询)
- [x] **3.5** 实现三个 Agent (PriceMonitor, Condition, TradeExecution) — Worker
- [ ] **3.6** 完整 Demo 测试 ⏳

### Phase 4: X Layer 优化 + 文档 (14-18h) ⏳ PENDING

- [ ] **4.1** 错误处理完善
- [ ] **4.2** 日志和调试
- [ ] **4.3** 编写 X Layer 提交文档
- [ ] **4.4** 录制 Demo 视频

### Phase 5: Solana 适配器开始 (20-24h) ✅ COMPLETED

- [x] **5.1** 初始化 Solana 项目结构
- [x] **5.2** Agent Registry Program (Metaplex compatible)
- [x] **5.3** A2A Market Program
- [ ] **5.4** Token Launch (Metaplex Genesis) ⏳ 简化版
- [ ] **5.5** x402 Payment 集成 ⏳ 待完成

**产出:** `packages/solana-adapter/programs/` 两合约完整实现

---

## Day 2 - 3月24日（周日）

### Phase 6: Solana 合约 (0-6h) ⏳ PENDING

- [ ] **6.1** Agent Registry 集成 (Metaplex)
- [ ] **6.2** A2A Market Program
- [ ] **6.3** Token Launch 集成 (Metaplex Genesis)
- [ ] **6.4** x402 Payment 实现

### Phase 7: Solana 前端 (6-10h) 🟡 IN PROGRESS

- [x] **7.1** 初始化 Solana 前端 (Next.js + Phantom)
- [x] **7.2** A2A 市场界面 (mock data)
- [x] **7.3** Agent Registry 界面
- [ ] **7.4** Token 启动界面 ⏳
- [ ] **7.5** 完整 Demo 测试 ⏳

### Phase 8: 双版本测试 (12-16h) ⏳ PENDING

- [ ] **8.1** X Layer 最终测试
- [ ] **8.2** Solana 最终测试
- [ ] **8.3** 修复阻塞 Bug

### Phase 9: X Layer 提交 (16-18h) ⏳ PENDING

- [ ] **9.1** 部署到 X Layer 主网
- [ ] **9.2** 最终验证
- [ ] **9.3** 提交

---

## Day 3 - 3月25日（周一）

### Phase 10: Solana 优化 + 文档 (0-8h) ⏳ PENDING

- [ ] **10.1** Solana 性能优化
- [ ] **10.2** 编写 Solana 提交文档
- [ ] **10.3** 准备 X Article
- [ ] **10.4** 录制 Demo 视频

### Phase 11: Solana 提交 (8-12h) ⏳ PENDING

- [ ] **11.1** 发布 X Article
- [ ] **11.2** Quote RT 比赛公告
- [ ] **11.3** 确认提交成功

### Phase 12: 缓冲 (14-24h) ⏳ PENDING

- [ ] **12.1** 修复突发问题
- [ ] **12.2** 优化演示
- [ ] **12.3** 准备评委问答

---

## 关键决策记录

| # | 决策 | 时间 | 状态 |
|---|------|------|------|
| 1 | 双轨并行策略 | 3/23 | ✅ 确认 |
| 2 | Solana 不降级（完整 A2A + Token） | 3/23 | ✅ 确认 |
| 3 | 跳过完整 /plan-eng-review | 3/23 | ✅ 确认 |
| 4 | 先做共享核心类型 | 3/23 | ⏳ 执行中 |

---

## 风险追踪

| 风险 | 概率 | 影响 | 缓解措施 | 状态 |
|------|------|------|---------|------|
| 时间不足 | 高 | 无法完成双轨 | 设定保底版本 | 🟡 监控 |
| 合约漏洞 | 中 | 资金损失 | 简化逻辑，多测试 | 🟡 监控 |
| 第三方服务故障 | 中 | Demo 失败 | 准备 mock 数据 | 🟢 已规划 |

---

*由 gstack /plan-ceo-review 生成*
