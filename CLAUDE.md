# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

```
xagent/
├── packages/
│   ├── agent-sdk/              # @xagent/agent-sdk — core SDK, built first
│   ├── worker-cloudflare/      # Cloudflare Worker (depends on agent-sdk)
│   ├── xlayer-adapter/
│   │   └── frontend/           # Next.js 14 App Router frontend (Vercel)
│   ├── shared-orchestrator/    # Shared runtime abstraction (CF/Node)
│   ├── node-local/             # Local node runner (dev/testing)
│   └── solana-adapter/         # Solana integration (WIP)
├── contracts/                  # Smart contracts (Solidity/Move/Rust)
├── vendor/pi-worker/           # Vendored pi-worker packages (do not modify)
└── docs/                       # Architecture design docs
```

## Key Commands

### Agent SDK (must build before worker-cloudflare)
```bash
cd packages/agent-sdk
npm run build        # tsc → dist/
npm run dev          # tsc --watch
```

### Cloudflare Worker
```bash
cd packages/worker-cloudflare
npm run dev          # runs prepare:sdk + prepare:pi-worker, then wrangler dev
npm run deploy       # builds sdk, then wrangler deploy
npm run typecheck    # tsc --noEmit
```

### Frontend (Next.js)
```bash
cd packages/xlayer-adapter/frontend
npm run dev          # next dev
npm run build        # next build
npm run lint         # next lint
```

## Architecture

### Agent Wallet Derivation
All agent wallets are deterministic — no per-agent key management:
```typescript
privateKey = keccak256(`${masterKey}:${agentName}`)
wallet = new ethers.Wallet(privateKey)
```
Standard agent names: `"orchestrator"`, `"price-oracle"`, `"trade-strategy"`.
One `NODE_PRIVATE_KEY` env var controls all agent wallets.

### A2A Payment Flow
`A2APaymentWorkflow` (Cloudflare Durable Workflow) executes 5 atomic steps:
1. `validate` — derive agent addresses from `NODE_PRIVATE_KEY`
2. `collect` — `USDC.transferFrom(caller → orchestrator, budget)`
3. `price_query` — pay priceOracle 0.001 USDC + fetch price
4. `strategy` — pay tradeStrategy 0.005 USDC + analyze
5. `refund` — sweep remaining USDC back to caller

Each `step.do()` is serializable and individually retried by CF on failure. Do not pass non-serializable objects (class instances, functions) in step return values.

### Agent SDK (`packages/agent-sdk`)
Two integration patterns:
- **Quick**: `createXAgentSession(config)` — one-call setup, creates pi-worker session with all XAgent tools
- **Manual**: `createXAgentTools(config)` + `createAgentSession({ customTools })` — compose yourself

`XAgent` base class provides: `collectFee()`, `payAgent()`, `refundAll()`, `getBalance()`, `getInfo()`.
Agent subclasses: `WorkflowOrchestrator`, `PriceOracleAgent`, `TradeStrategyAgent`.

### Worker Routes (`packages/worker-cloudflare/src/index.ts`)
- `GET /health` — status check
- `GET /api/agents` — live agent info (uses SDK `getInfo()`)
- `POST /api/a2a` — start A2A workflow, returns `{ jobId }`
- `GET /api/a2a/:jobId` — poll workflow status
- `POST /api/a2a/simulate` — dry-run without real payments
- `POST /api/deploy` — create AgentSession Durable Object, returns `{ sessionId }`
- `POST /agent/chat/:sessionId` — chat with agent
- `GET /agent/history/:sessionId` — message history
- `POST /tasks/:taskId/confirm` — human-in-the-loop approval

### Cloudflare Bindings (wrangler.toml)
- `AGENT_SESSIONS` — Durable Object (SQLite-backed, one per chat session)
- `A2A_WORKFLOW` — CF Workflow for atomic A2A payments
- `CODEGEN_WORKFLOW` — CF Workflow for code generation
- `XAGENT_KV` — KV namespace for job state
- `AI` — Workers AI binding (fallback model)
- Cron: `*/1 * * * *` → `scheduled()` handler (scans for pending tasks)

### Frontend (`packages/xlayer-adapter/frontend`)
- Next.js 14 App Router, Tailwind CSS, ethers.js v6
- All Worker API calls go through `@/lib/api/worker` (`workerApi`)
- Contract addresses in `@/lib/contracts.ts` — fallback to hardcoded testnet addresses
- `NEXT_PUBLIC_WORKER_URL` env var points to the deployed CF Worker
- Docs section (`/docs/*`) uses its own standalone layout (not `DashboardLayout`)

### Deployed Contracts (X Layer Testnet, chainId 195)
| Contract | Address |
|---|---|
| TaskManager | `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686` |
| PaymentHub | `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60` |
| AgentRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| USDC | `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d` |

`AgentRegistry.registerAgent(name, metadataURI, bytes32[] capabilities)` — name must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/` (no hyphens, no leading digit).

### Worker Secrets (set via `wrangler secret put`)
- `NODE_PRIVATE_KEY` — master private key, controls all agent wallets
- `CF_GATEWAY_TOKEN` — Cloudflare AI Gateway API token (required for AI chat)
- `DOWNLOAD_SECRET` — HMAC secret for signed artifact download URLs

### Build Dependency Order
`agent-sdk` → `worker-cloudflare`. The `prepare:sdk` script in worker-cloudflare runs `cd ../agent-sdk && npm run build` automatically before `dev`/`deploy`.
`pi-worker` packages are vendored in `vendor/pi-worker/` — do not modify them.

### Vercel Deployment (Frontend)
- Root Directory: `packages/xlayer-adapter/frontend`
- Required env var: `NEXT_PUBLIC_WORKER_URL`
- Optional (have hardcoded fallbacks): `NEXT_PUBLIC_TASK_MANAGER_ADDRESS`, `NEXT_PUBLIC_PAYMENT_HUB_ADDRESS`
