# Codex 实现任务清单

**项目**: Gradience - Decentralized Agent Orchestration  
**目标**: 替换所有 Mock 功能为真实实现  
**文档**: `docs/IMPLEMENTATION_SPEC.md` (完整规范)  

---

## 任务 1: 修复合约连接 (最高优先级)

**文件**: 
- `packages/xlayer-adapter/frontend/lib/contracts.ts`
- `packages/xlayer-adapter/frontend/components/Web3Provider.tsx`

**问题**: 合约调用返回空数据

**实现**:
1. 添加地址 checksum 验证
2. 实现 MultiRpcProvider (备用 RPC)
3. 验证 ABI 正确性

**验收**: `node test-contract.js` 全部通过

---

## 任务 2: Workflow IPFS 存储

**文件**:
- `packages/xlayer-adapter/frontend/lib/workflowStorage.ts` (新建)
- `packages/xlayer-adapter/frontend/components/WorkflowBuilder.tsx`

**实现**:
```typescript
// 创建 WorkflowStorage 类
// - saveWorkflow(): 上传到 IPFS，返回 hash
// - loadWorkflow(): 从 IPFS 加载
// - local cache 作为备份
```

**验收**: Workflow 可以保存并在 IPFS 上查看

---

## 任务 3: Create Task 完整流程

**文件**:
- `packages/xlayer-adapter/frontend/components/WorkflowSubmit.tsx`
- `packages/xlayer-adapter/frontend/lib/taskService.ts` (新建)

**实现**:
1. Save Workflow to IPFS → get workflowHash
2. Check USDC allowance
3. Approve if needed
4. Call taskManager.createTask()
5. Wait for receipt, get taskId
6. Redirect to /tasks

**验收**: 可以成功创建任务并在链上查询到

---

## 任务 4: Task Status 轮询

**文件**:
- `packages/xlayer-adapter/frontend/components/TaskList.tsx`
- `packages/xlayer-adapter/frontend/lib/taskMonitor.ts` (新建)

**实现**:
```typescript
// TaskMonitor 类
// - startPolling(): 每 5 秒轮询任务状态
// - stopPolling(): 停止轮询
// - 自动更新 UI
```

**验收**: 任务状态自动更新，无需刷新页面

---

## 任务 5: Agent Market 真实数据

**文件**:
- `packages/xlayer-adapter/frontend/lib/agentMarket.ts` (新建)
- `packages/xlayer-adapter/frontend/app/agent/page.tsx`

**实现**:
1. 从 8004 Registry 读取 Agent 列表
2. 替换 MOCK_AGENTS
3. 实现 purchaseAccess()

**验收**: Agent 列表从链上读取，不是静态数据

---

## 任务 6: Agent Chat 真实 AI

**文件**:
- `packages/xlayer-adapter/frontend/lib/agentChat.ts` (新建)
- `packages/xlayer-adapter/frontend/app/agent/page.tsx`

**实现**:
```typescript
// 集成 Claude API
// - sendMessage(): 调用 Anthropic API
// - 流式响应支持
// - 上下文记忆
```

**验收**: Agent 使用真实 AI 响应，不是预设回复

---

## 任务 7: Worker 事件监听

**文件**:
- `packages/worker-cloudflare/src/index.ts`
- `packages/worker-cloudflare/src/handlers/EventListener.ts`

**实现**:
1. 修复 scheduled 事件处理
2. 实现 getPendingTasks() 查询
3. 使用 KV 存储 last_checked_block

**验收**: Worker 自动检测并执行新任务

---

## 任务 8: Worker 部署配置

**文件**:
- `packages/worker-cloudflare/.env` (新建)
- `packages/worker-cloudflare/deploy.sh` (新建)
- `packages/worker-cloudflare/wrangler.toml`

**实现**:
1. 创建环境变量模板
2. 创建部署脚本
3. 配置 KV 和 Durable Objects

**验收**: `wrangler deploy` 成功，Worker 在线

---

## 执行顺序

```
任务 1 → 任务 2 → 任务 3 → 任务 4 → (基础功能完成)
   ↓
任务 5 → 任务 6 → (Agent Terminal 完成)
   ↓
任务 7 → 任务 8 → (Worker 完成)
```

---

## 每任务标准流程

1. **阅读规范**: 查看 `docs/IMPLEMENTATION_SPEC.md` 对应章节
2. **创建/修改文件**: 按规范实现
3. **添加测试**: 如果有测试文件
4. **本地验证**:
   ```bash
   # 前端
   cd packages/xlayer-adapter/frontend
   npm run build
   
   # Worker
   cd packages/worker-cloudflare
   npm run build
   ```
5. **提交**:
   ```bash
   git add -A
   git commit -m "feat: 实现 [功能名]"
   git push origin main
   ```

---

## 快速验证命令

```bash
# 测试合约连接
cd /Users/davirian/dev/zig/gradience
node test-contract.js

# 测试前端构建
cd packages/xlayer-adapter/frontend
npm run build

# 测试前端运行
npm run dev
# 然后访问 http://localhost:3000

# 查看 Worker 日志
cd packages/worker-cloudflare
wrangler tail
```

---

## 提交信息模板

```
feat: [功能名称]

- 实现 [具体功能]
- 替换 [旧 Mock] 为 [新实现]
- 测试: [测试情况]

Fixes: #[issue number if any]
```

---

**开始执行任务 1...**
