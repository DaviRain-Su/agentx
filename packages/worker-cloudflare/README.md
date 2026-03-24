# Gradience Worker - Cloudflare

AI Agent 执行 Worker，运行在 Cloudflare Workers 上。

## 功能特性

- **区块链轮询**: 每分钟自动检查 X Layer 上的新任务
- **工作流执行**: 支持顺序、并行、条件执行模式
- **状态管理**: 使用 Cloudflare KV 持久化任务状态
- **人在回路**: 支持人工确认检查点
- **重试机制**: 指数退避重试策略
- **错误处理**: 结构化错误类型和恢复机制

## 架构

```
src/
├── index.ts              # 主入口 (HTTP + Scheduled)
├── executors/
│   └── TaskExecutor.ts   # 核心执行器
├── services/
│   ├── WorkflowService.ts    # 工作流获取
│   ├── StateManager.ts       # 状态管理
│   └── HumanLoopService.ts   # 人在回路
├── agents/
│   ├── PriceMonitorAgent.ts
│   ├── ConditionAgent.ts
│   └── TradeExecutorAgent.ts
├── utils/
│   ├── errors.ts         # 错误类型
│   └── retry.ts          # 重试逻辑
└── config/
    └── contracts.ts      # 合约配置
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 KV

创建 KV namespace:

```bash
wrangler kv:namespace create "GRADIENCE_KV"
```

更新 `wrangler.toml` 中的 id。

### 3. 设置 Secrets

```bash
# Worker 钱包私钥 (用于提交交易)
wrangler secret put PRIVATE_KEY

# (可选) CoinGecko API Key
wrangler secret put COINGECKO_API_KEY

# (可选) xurl API Key
wrangler secret put XURL_API_KEY
```

### 4. 本地开发

```bash
npm run dev
```

### 5. 部署

```bash
npm run deploy
```

## API 端点

### Health Check
```bash
GET /health
```

### 获取任务状态
```bash
GET /tasks/:taskId
```

### 手动触发执行 (测试用)
```bash
POST /execute
Content-Type: application/json

{
  "taskId": "123",
  "workflowHash": "0x..."
}
```

### 取消任务
```bash
POST /cancel
Content-Type: application/json

{
  "taskId": "123"
}
```

## 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `PRIVATE_KEY` | ✅ | Worker 钱包私钥 |
| `XLAYER_RPC_URL` | ✅ | X Layer RPC 端点 |
| `GRADIENCE_KV` | ✅ | Cloudflare KV 绑定 |
| `COINGECKO_API_KEY` | ❌ | CoinGecko API Key |
| `XURL_API_KEY` | ❌ | xurl.io API Key |
| `DEMO_MODE` | ❌ | 设为 "true" 启用自动确认 |

## 工作流格式

```json
{
  "name": "Price Alert Trading",
  "executionMode": "sequential",
  "steps": [
    {
      "id": "step-1",
      "agentId": "price-monitor",
      "name": "Monitor ETH Price",
      "config": { "token": "ethereum", "source": "coingecko" },
      "dependsOn": [],
      "humanApproval": false,
      "timeout": 60
    },
    {
      "id": "step-2",
      "agentId": "condition-eval",
      "name": "Evaluate Condition",
      "config": { "condition": "price < 1800" },
      "dependsOn": ["step-1"],
      "humanApproval": true,
      "timeout": 300
    },
    {
      "id": "step-3",
      "agentId": "trade-executor",
      "name": "Execute Trade",
      "config": { "action": "buy", "token": "ETH", "amount": "0.1" },
      "dependsOn": ["step-2"],
      "humanApproval": true,
      "timeout": 300
    }
  ]
}
```

## 支持的 Agent

| Agent ID | 功能 | 配置参数 |
|----------|------|----------|
| `price-monitor` | 获取代币价格 | `token`, `source` |
| `condition-eval` | 评估条件 | `condition` 或 `operator` + `threshold` |
| `trade-executor` | 准备交易 | `action`, `token`, `amount` |

## 错误处理

Worker 使用结构化错误类型:

- `WorkflowError`: 工作流相关问题
- `AgentExecutionError`: Agent 执行失败
- `HumanLoopTimeoutError`: 人工确认超时
- `ContractError`: 区块链交互失败

可重试的错误会自动重试（最多3次，指数退避）。

## 监控

### 日志
Worker 输出结构化日志到 Cloudflare Workers 日志系统。

### 指标
- 任务成功率
- 执行时间
- 重试次数
- 错误类型分布

## 测试

### 本地测试
```bash
# 运行 health check
curl http://localhost:8787/health

# 手动触发任务
curl -X POST http://localhost:8787/execute \
  -H "Content-Type: application/json" \
  -d '{"taskId": "test-1", "workflowHash": "mock"}'

# 查看任务状态
curl http://localhost:8787/tasks/test-1
```

### 模拟模式
设置 `DEMO_MODE=true` 启用自动确认（跳过人在回路）。

## 生产部署检查清单

- [ ] 使用专用钱包（不要混用）
- [ ] 配置足够的 gas
- [ ] 设置监控告警
- [ ] 配置日志收集
- [ ] 测试故障恢复
- [ ] 设置 rate limiting

## License

MIT
