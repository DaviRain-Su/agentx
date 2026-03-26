# AgentX 功能测试计划

## 测试环境
- **网络**: X Layer Testnet
- **RPC**: https://xlayertestrpc.okx.com
- **钱包**: MetaMask / OKX Wallet
- **测试账户**: 0x067aBc270C4638869Cd347530Be34cBdD93D0EA1

## 合约地址
- TaskManager: `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686`
- PaymentHub: `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60`
- USDC: `0x67d0E8F4Ef68D739893209bA018273a8F5FF845E`
- 8004 Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`

---

## 测试项 1: 钱包连接

### 测试步骤
1. 打开 http://localhost:3000
2. 点击 "INITIALIZE SESSION" 或 "Connect Wallet"
3. 选择 MetaMask/OKX Wallet
4. 切换到 X Layer Testnet

### 期望结果
- [ ] 钱包成功连接
- [ ] 显示正确地址
- [ ] 网络显示为 X Layer Testnet
- [ ] USDC 余额正确显示

### 实际结果
- 状态: ❓ 待测试
- 问题: 
- 截图: 

---

## 测试项 2: Workflow Builder

### 测试步骤
1. 进入 /workflows
2. 创建新 Workflow:
   - 步骤1: Price Monitor Agent (sequential)
   - 步骤2: Condition Check (conditional)
   - 步骤3: Trade Executor (parallel)
3. 保存 Workflow

### 期望结果
- [ ] 可以添加多个步骤
- [ ] 可以设置执行模式 (sequential/parallel/conditional)
- [ ] 可以保存 Workflow
- [ ] Workflow JSON 正确生成

### 实际结果
- 状态: ❓ 待测试
- 问题: 
- 截图: 

---

## 测试项 3: USDC 批准 (Approve)

### 测试步骤
1. 创建 Workflow 后点击 Submit
2. 输入 USDC 金额
3. 点击 Approve

### 期望结果
- [ ] MetaMask 弹出批准交易
- [ ] 交易成功确认
- [ ] 批准额度正确设置

### 实际结果
- 状态: ❓ 待测试
- 交易哈希: 
- 问题: 

---

## 测试项 4: 创建任务 (Create Task)

### 测试步骤
1. USDC 批准后点击 "Create Task"
2. 确认合约调用

### 期望结果
- [ ] MetaMask 弹出合约调用
- [ ] 交易成功确认
- [ ] Task ID 正确返回
- [ ] 任务显示在 Task List 中

### 实际结果
- 状态: ❓ 待测试
- 交易哈希: 
- Task ID: 
- 问题: 

---

## 测试项 5: Worker 任务执行

### 测试步骤
1. 创建任务后等待 1-2 分钟
2. 检查 Worker 日志
3. 查看 Task 状态

### 期望结果
- [ ] Worker 接收到 TaskCreated 事件
- [ ] Worker 开始执行任务
- [ ] 任务状态变为 "Executing"
- [ ] 执行完成后状态变为 "Completed"

### 检查命令
```bash
# 查看 Worker 日志
wrangler tail

# 直接查询合约
const task = await taskManager.getTask(taskId);
console.log(task.status); // 0=Pending, 1=Executing, 2=Completed, 3=Failed
```

### 实际结果
- 状态: ❓ 待测试
- Worker 日志: 
- 问题: 

---

## 测试项 6: Task List 查询

### 测试步骤
1. 进入 /tasks
2. 查看任务列表

### 期望结果
- [ ] 显示所有任务
- [ ] 任务状态正确显示
- [ ] 任务详情可点击

### 实际结果
- 状态: ❓ 待测试
- 问题: 
- 截图: 

---

## 测试项 7: Agent Terminal (Marketplace)

### 测试步骤
1. 进入 /agent
2. 查看 Free Agents
3. 选择一个 Free Agent 开始对话
4. 发送测试消息

### 期望结果
- [ ] Marketplace 正确显示
- [ ] 可以开始对话
- [ ] Agent 有响应 (即使是 Mock)

### 实际结果
- 状态: ❓ 待测试
- 问题: 
- 截图: 

---

## 测试项 8: Teams 页面

### 测试步骤
1. 进入 /teams
2. 查看 Team 列表
3. 尝试 Hire Team

### 期望结果
- [ ] Team 列表显示
- [ ] 可以 Hire Team
- [ ] USDC 支付成功

### 实际结果
- 状态: ❓ 待测试
- 问题: 
- 截图: 

---

## 端到端完整流程测试

### 测试场景: 完整 Workflow 执行
1. 连接钱包
2. 创建 3 步骤 Workflow
3. 批准 USDC
4. 创建任务
5. 等待 Worker 执行
6. 查看任务完成状态

### 期望时间
- 钱包连接: < 10s
- Workflow 创建: < 30s
- USDC 批准: < 30s (区块链确认)
- 任务创建: < 30s (区块链确认)
- Worker 执行: < 2min
- 总计: < 4min

### 实际结果
- 状态: ❓ 待测试
- 总时间: 
- 问题: 

---

## 已知问题清单

### 🔴 阻塞性问题 (必须修复)
1. 

### 🟡 严重问题 (影响演示)
1. 

### 🟢 轻微问题 (可以容忍)
1. 

---

## 测试记录

| 时间 | 测试项 | 结果 | 问题 | 修复状态 |
|------|--------|------|------|----------|
| | | | | |

---

## 演示准备检查清单

### 演示前 1 小时
- [ ] 钱包有足量 OKB (gas)
- [ ] 钱包有足量 USDC
- [ ] Worker 正常运行
- [ ] 前端可以访问

### 演示前 10 分钟
- [ ] 测试一次完整流程
- [ ] 确认所有页面加载正常
- [ ] 准备备用方案 (如果 live demo 失败)
