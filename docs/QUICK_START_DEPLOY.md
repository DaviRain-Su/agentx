# Quick Deploy Guide - X Layer Hackathon

## ⚡ 5分钟快速部署 Worker

### 前置要求
- Cloudflare 账号 (免费)
- Wrangler CLI 安装
- X Layer Testnet 钱包 (有一些 OKB)

### 步骤

```bash
cd packages/worker-cloudflare

# 1. 安装依赖
npm ci

# 2. 登录 Cloudflare
wrangler login

# 3. 设置密钥
wrangler secret put XLAYER_RPC_URL
# 输入: https://xlayertestrpc.okx.com

wrangler secret put NODE_PRIVATE_KEY
# 输入: 你的以太坊私钥 (带0x前缀)

wrangler secret put CF_ACCOUNT_ID
# 输入: Cloudflare Account ID

wrangler secret put CF_GATEWAY_TOKEN
# 输入: Cloudflare API Token

# 4. 部署
wrangler deploy

# 5. 测试
curl https://agentx-worker.davirain-yin.workers.dev/health
```

---

## 🔧 前端快速配置

### 1. 创建 .env.local

```bash
cd packages/xlayer-adapter/frontend
cp .env.example .env.local
```

### 2. 填写环境变量

```env
NEXT_PUBLIC_TASK_MANAGER_ADDRESS=0x39223444d2f9a4d6769e91aa7908CB22CA3A8686
NEXT_PUBLIC_PAYMENT_HUB_ADDRESS=0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60
NEXT_PUBLIC_USDC_ADDRESS=0x67d0E8f4Ef68D739893209bA018273A8F5Ff845e
NEXT_PUBLIC_WORKER_URL=https://agentx-worker.davirain-yin.workers.dev
```

### 3. 启动

```bash
npm run dev
```

---

## ✅ 验证清单

### Worker 验证
- [ ] `curl /health` 返回 200
- [ ] Agent Terminal 能连接 Worker
- [ ] AI 回复不是预设的 Mock

### 前端验证
- [ ] 能连接 MetaMask
- [ ] 能创建 Workflow
- [ ] 能提交 Task (调用合约)
- [ ] Task 列表显示真实数据

### 完整流程验证
- [ ] Create Workflow → Submit → Task Created
- [ ] Worker 接收任务并执行
- [ ] Agent Terminal 显示执行结果

---

## 🚨 常见问题

### Worker 部署失败
```bash
# 检查 wrangler.toml
# 确保 account_id 正确
wrangler whoami
```

### 合约调用失败
```bash
# 检查 RPC
node test-contract.js

# 检查地址 checksum
ethers.getAddress("0x...")
```

### AI 不回复
```bash
# 检查 CF_GATEWAY_TOKEN
wrangler secret list

# 检查 AI Gateway 配置
wrangler ai gateway list
```

---

## 📞 紧急联系

如果部署遇到问题:
1. 检查 wrangler logs: `wrangler tail`
2. 检查浏览器控制台
3. 验证合约地址

时间紧迫，专注核心功能!
