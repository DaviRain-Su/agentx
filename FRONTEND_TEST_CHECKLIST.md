# Frontend 功能测试清单

## 测试环境
- URL: http://localhost:3000
- 网络: X Layer Testnet
- 钱包: MetaMask/OKX Wallet

---

## 1. 页面加载测试

### 1.1 Landing Page (/) ✅
- [ ] 页面加载无错误
- [ ] Particle 动画正常显示
- [ ] "ENTER SYSTEM" 按钮可点击
- [ ] 跳转到 Dashboard

### 1.2 Dashboard (/)
- [ ] 侧边栏菜单正确显示
- [ ] 粒子背景动画正常
- [ ] 菜单项可点击跳转

### 1.3 Workflows (/workflows)
- [ ] 页面加载无错误
- [ ] Workflow Builder 显示
- [ ] 可以添加步骤

### 1.4 Tasks (/tasks)
- [ ] 页面加载无错误
- [ ] Task 列表显示
- [ ] 没有"missing error components"错误

### 1.5 Teams (/teams)
- [ ] 页面加载无错误
- [ ] Team 列表显示
- [ ] 可以查看团队详情

### 1.6 Agent Terminal (/agent)
- [ ] 页面加载无错误
- [ ] Marketplace 视图显示
- [ ] Free/Paid Agent 分类显示

---

## 2. 钱包连接测试

### 2.1 连接流程
- [ ] 点击 "Connect Wallet"
- [ ] 弹出 MetaMask/OKX
- [ ] 选择账户后连接成功
- [ ] 显示正确地址

### 2.2 网络检查
- [ ] 自动提示切换网络
- [ ] 切换到 X Layer Testnet
- [ ] 显示网络名称

---

## 3. Workflow 功能测试

### 3.1 创建 Workflow
- [ ] 点击 "Add Step"
- [ ] 输入 Agent DID
- [ ] 选择执行模式 (Sequential/Parallel/Conditional)
- [ ] 保存 Workflow

### 3.2 提交任务
- [ ] 点击 "Submit Workflow"
- [ ] 输入预算金额
- [ ] USDC 批准流程
- [ ] 创建任务交易

---

## 4. 已知问题清单

### 🔴 阻塞性问题
1. USDC 合约地址可能不正确
2. TaskManager 合约调用失败

### 🟡 需要确认的问题
1. Worker 是否正确接收任务
2. 任务状态是否正确更新

---

## 测试记录

| 时间 | 测试项 | 结果 | 备注 |
|------|--------|------|------|
| | | | |

---

## 快速修复命令

```bash
# 重启前端
cd packages/xlayer-adapter/frontend
pkill -9 -f "next"
npm run dev

# 检查合约连接
cd /Users/davirian/dev/zig/gradience
node test-contract.js

# 提交修复
git add -A
git commit -m "fix: xxx"
git push origin main
```
