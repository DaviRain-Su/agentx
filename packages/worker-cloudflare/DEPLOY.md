# Worker 部署指南

## 前置要求

1. Cloudflare 账号
2. 已安装 wrangler CLI

## 部署步骤

### 1. 登录 Cloudflare

```bash
wrangler login
```

### 2. 创建 KV Namespace

```bash
wrangler kv:namespace create "GRADIENCE_KV"
```

复制输出的 id，更新 `wrangler.toml`：

```toml
[[kv_namespaces]]
binding = "GRADIENCE_KV"
id = "你的_kv_id"
```

### 3. 设置 Secrets

```bash
# Worker 钱包私钥（用于提交交易）
wrangler secret put PRIVATE_KEY

# (可选) CoinGecko API Key
wrangler secret put COINGECKO_API_KEY

# (可选) xurl API Key
wrangler secret put XURL_API_KEY
```

### 4. 部署 Worker

```bash
wrangler deploy
```

## 验证部署

部署完成后，测试以下端点：

```bash
# Health check
curl https://gradience-worker.你的子域名.workers.dev/health

# 手动触发任务（测试用）
curl -X POST https://gradience-worker.你的子域名.workers.dev/execute \
  -H "Content-Type: application/json" \
  -d '{"taskId": "test-1", "workflowHash": "mock"}'
```

## 监控

- 查看日志：`wrangler tail`
- 查看 KV 数据：Cloudflare Dashboard > Workers & Pages > KV
