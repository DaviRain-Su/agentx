# Gradience — Submission Document

## Project Overview

**Gradience** is a decentralized AI Agent orchestration protocol enabling autonomous agents to discover, hire, and collaborate with each other across blockchains. Built for the dual X Layer + Solana hackathon.

### Core Value Proposition

- **Workflow Engine**: DAG-based task orchestration with sequential, parallel, and conditional execution
- **Human-in-the-Loop**: 5-minute timeout confirmation gates for critical operations
- **On-chain Payments**: USDC escrow via PaymentHub with per-agent settlement
- **Agent Registry**: ERC-8004 / Metaplex-compatible decentralized agent identities

---

## Track 1: X Layer

### Live Demo
- Frontend: `http://localhost:3000` (run `cd packages/xlayer-adapter/frontend && npm run dev`)
- Worker: Deploy via `cd packages/worker-cloudflare && wrangler deploy`

### Deployed Contracts (X Layer Testnet, Chain ID: 1952)

| Contract | Address |
|----------|---------|
| **TaskManager** | `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686` |
| **PaymentHub** | `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60` |
| **USDC (Testnet)** | `0x67d0E8f4Ef68D739893209bA018273a8F5FF845E` |
| **8004 Agent Registry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` (Charlie's) |

### Architecture

```
User Browser (Next.js 14)
    ↓ ethers.js
TaskManager.sol (X Layer Testnet)
    ↓ events
Cloudflare Worker (every 60s)
    ↓ executes agents
    ├── PriceMonitorAgent   (CoinGecko API)
    ├── ConditionEvalAgent  (expression evaluator)
    └── TradeExecutorAgent  (DEX calldata builder)
    ↓ on-chain result
PaymentHub.sol (USDC escrow release)
```

### Key Features Demonstrated
1. **Workflow Creation** — select template → approve USDC → create on-chain task
2. **Real-time Status** — tasks page polls chain every 10s showing live status
3. **Human-in-the-Loop** — step confirmation modal with 5-minute countdown
4. **Multi-mode Execution** — sequential, parallel, conditional workflow types

### Integration with X Layer Ecosystem
- Uses **OKX Connect** compatible wallet (MetaMask / OKX Wallet)
- USDC payments via testnet USDC
- References **Charlie's ERC-8004 Agent Registry** for agent DIDs

---

## Track 2: Solana

### Live Demo
- Frontend: `http://localhost:3001` (run `cd packages/solana-adapter/frontend && npm install && npm run dev`)

### Programs (Solana Devnet — pending deployment)

| Program | Description |
|---------|-------------|
| **Agent Registry** | Metaplex-compatible on-chain agent identities |
| **A2A Market** | Agent-to-Agent service marketplace with SPL escrow |
| **Reputation** | On-chain trust scoring system |

### Architecture

```
User Browser (Next.js 14)
    ↓ @solana/wallet-adapter (Phantom)
Agent Registry Program (Metaplex-compatible)
    ↓ agent DID
A2A Market Program
    ↓ SPL token escrow
Task execution via shared WorkflowEngine
```

### Solana-Specific Features
- **Metaplex integration**: Agent NFTs as identity tokens
- **SPL token payments**: Native SOL + SPL token support
- **Reputation system**: On-chain task completion scores

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend (X Layer) | Next.js 14, React 18, Tailwind CSS, Ethers.js v6 |
| Frontend (Solana) | Next.js 14, React 18, @solana/wallet-adapter |
| Core Engine | TypeScript, Zod, DAG execution |
| X Layer Contracts | Solidity 0.8.20, OpenZeppelin |
| Solana Programs | Rust, Anchor 0.29 |
| Worker | Cloudflare Workers + KV |

---

## Running Locally

### X Layer Frontend
```bash
cd packages/xlayer-adapter/frontend
npm install
npm run dev
# → http://localhost:3000
```

### Solana Frontend
```bash
cd packages/solana-adapter/frontend
npm install
npm run dev
# → http://localhost:3001
```

### Cloudflare Worker
```bash
cd packages/worker-cloudflare
wrangler login
wrangler kv namespace create GRADIENCE_KV
# Update wrangler.toml with KV namespace ID
wrangler secret put PRIVATE_KEY
wrangler deploy
```

---

## Team

Built solo for the X Layer × Solana dual hackathon.

---

*Generated: 2025-03-24*
