# X Layer Hackathon Submission Checklist

**Deadline: March 26, 2025 (Tomorrow)**

## ✅ Completed

### Core Infrastructure
- [x] Workflow Engine with DAG builder
- [x] Sequential/Parallel/Conditional execution modes
- [x] Human-in-the-loop with 5-min timeout
- [x] State management with xurl

### Smart Contracts (X Layer Testnet)
- [x] TaskManager: `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686`
- [x] PaymentHub: `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60`
- [x] TeamRegistry (new): Created, needs deployment
- [x] Integration with Charlie 8004 Agent Registry

### Frontend
- [x] Next.js + TypeScript app
- [x] Unified black/white design with particle animation
- [x] Wallet connection (MetaMask/OKX)
- [x] Workflow Builder UI
- [x] Task List with real contract queries
- [x] Teams page with hiring UI
- [x] Error handling (error.tsx, global-error.tsx)

### Agent Execution
- [x] Cloudflare Worker architecture
- [x] Abstract Runtime (Cloudflare + Node.js)
- [x] Local execution node support
- [x] Event listener for tasks
- [x] Task executor with sandbox

### Advanced Features
- [x] TEE architecture design (Phala, EG, Marlin)
- [x] CodeFlare framework (code generation + execution)
- [x] Decentralized execution network design

### Documentation
- [x] System architecture docs (8 documents)
- [x] Team collaboration design
- [x] TEE execution design
- [x] CodeFlare framework design

## 🔄 In Progress / TODO

### Critical (Must Have)
- [ ] **Deploy TeamRegistry contract** - New contract needs deployment
- [ ] **Test end-to-end flow** - Create task → Approve → Execute → Complete
- [ ] **Verify Worker is polling** - Check if Worker can receive tasks

### Important (Should Have)
- [ ] **Create demo video** - 2-3 min showing the workflow
- [ ] **Write X Article** - For submission and quote RT
- [ ] **Update README** - Clear setup instructions

### Nice to Have
- [ ] **Solana contracts** - Already have framework, needs deployment
- [ ] **Solana frontend** - A2A marketplace UI

## 🎯 XLayer 审查落地清单（仅 XLayer）

> 目标：把“可演示 Demo”补齐为“可提交的 XLayer 版本”。

### P0（今天必须完成）

- [ ] **切到 XLayer 主网部署（硬性要求）**
  - [ ] 部署 `TaskManager`、`PaymentHub`、`TeamRegistry` 到主网
  - [ ] 更新前端与 Worker 合约地址为主网地址
  - [ ] `docs/SUBMISSION.md` 同步主网地址与链信息
  - **DoD**: 前端连接主网后可读到新合约状态

- [ ] **打通支付闭环（Task ↔ Escrow ↔ Release/Refund）**
  - [ ] 前端任务创建流程先 `PaymentHub.createEscrow`
  - [ ] 任务执行成功后可触发 `releaseEscrow`
  - [ ] 任务取消/失败后可触发 `refundEscrow`
  - **DoD**: 单任务全链路完成后，USDC 流向正确（用户/平台/Agent）

- [ ] **打通 Worker 自动执行闭环**
  - [ ] 将 `TaskExecutor` 接入 Worker 主入口调度
  - [ ] 监听 `TaskCreated` 并触发执行
  - [ ] 步骤结果回写 `recordStepCompletion`
  - **DoD**: 不人工干预情况下，任务可从 created → completed/failed

- [ ] **完成 E2E 验证（按提交流程）**
  - [ ] Create task
  - [ ] Human approval
  - [ ] Worker execution
  - [ ] On-chain completion + payment settlement
  - **DoD**: 录屏一次完整流程，链上状态与前端状态一致

- [ ] **部署并接入 TeamRegistry**
  - [ ] 部署合约并配置 `NEXT_PUBLIC_TEAM_REGISTRY_ADDRESS`
  - [ ] Teams 页面可真实读写（创建团队、雇佣团队）
  - **DoD**: `/teams` 页不再使用零地址，最少完成一次链上 hire

### P1（明天优先）

- [ ] **最小 OnchainOS 集成（至少一个真实调用）**
  - [ ] 引入 OKX/OnchainOS SDK 或 DEX API
  - [ ] 在 DeFi/交易流程中展示真实调用结果
  - **DoD**: Demo 中可展示 1 个真实 OKX 生态调用

- [ ] **清理核心路径中的 Mock 依赖**
  - [ ] `workflows/tasks/teams` 主流程不依赖 mock 数据
  - [ ] 保留 mock 仅用于 fallback 或演示开关
  - **DoD**: 断开 mock 后主流程仍可跑通

### 发布前 Gate（必须全绿）

- [ ] 主网合约地址、前端地址、Worker 地址全部可访问
- [ ] E2E 脚本执行成功（至少 1 次）
- [ ] 演示视频（2-3 分钟）录制完成
- [ ] 提交材料与仓库信息一致（地址、命令、截图）

## 🚀 Deployment Commands

### Deploy TeamRegistry (if needed)
```bash
cd packages/xlayer-adapter/contracts
source .env
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

### Deploy Worker
cd packages/worker-cloudflare
wrangler deploy

### Start Frontend
cd packages/xlayer-adapter/frontend
npm run dev

## 📹 Demo Script

1. **Landing Page** - Show design and features
2. **Connect Wallet** - Connect to X Layer Testnet
3. **Create Workflow** - Build a 3-step workflow
4. **Submit Task** - Approve USDC and create task
5. **Human Approval** - Show approval modal with countdown
6. **Worker Execution** - (If working) Show task completion
7. **Task History** - Show completed tasks

## 📝 X Article Outline

**Title**: "Gradience: Building the Decentralized Agent Orchestration Platform on X Layer"

**Key Points**:
- Problem: AI agents are centralized and isolated
- Solution: Decentralized orchestration with human oversight
- Tech: X Layer for fast/cheap settlement
- Features: Workflow builder, team collaboration, TEE security
- CodeFlare: AI agents that write and deploy code

**Call to Action**: Try the demo, join the network
