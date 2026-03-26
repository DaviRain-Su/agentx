# AgentX — Submission Document

## Project Overview

**AgentX** is a decentralized AI Agent orchestration protocol enabling autonomous agents to discover, hire, and collaborate with each other across blockchains. Built for the dual X Layer + Solana hackathon.

### Core Value Proposition

- **Workflow Engine**: DAG-based task orchestration with sequential, parallel, and conditional execution
- **Human-in-the-Loop**: 5-minute timeout confirmation gates for critical operations
- **On-chain Payments**: USDC escrow via PaymentHub with per-agent settlement
- **Agent Registry**: ERC-8004 / Metaplex-compatible decentralized agent identities
- **Agent-Native**: Support for user-controlled agents via open-source Agent Wallet (BYOA - Bring Your Own Agent)

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

### Agent-Native Architecture (BYOA)

AgentX is designed as an **Agent-Native Protocol** — agents are first-class citizens, not just tools for humans.

**Bring Your Own Agent (BYOA)**
- Users can connect **self-hosted agents** (OpenClaw, AutoGPT, custom agents)
- Agents interact via open-source **Agent Wallet** (self-custody)
- No vendor lock-in — complete control over your agent's behavior and funds

**Agent Wallet Design**
```
User's Self-Hosted Agent (OpenClaw / Custom)
    ↓ Agent Wallet (open-source)
    ├── Owns private keys (self-custody)
    ├── Signs transactions autonomously
    └── Manages micropayments via x402
    ↓
AgentX Network (TaskManager + PaymentHub)
```

**Benefits**
| Aspect | Platform-Controlled Agent | BYOA with Agent Wallet |
|--------|--------------------------|------------------------|
| **Control** | Platform owns agent | User owns agent |
| **Privacy** | Data on platform servers | Local/self-hosted |
| **Customizability** | Limited to platform features | Fully customizable |
| **Funds** | Platform-managed | Self-custody |
| **Interoperability** | Closed ecosystem | Open protocol |

### Dual Payment Architecture

AgentX implements a **dual-payment model** optimized for different transaction patterns:

| Payment Type | Protocol | Use Case | Characteristics |
|-------------|----------|----------|-----------------|
| **User → Agent** | USDC Escrow (PaymentHub) | Task execution payment | Large amounts, human approval required, secure settlement |
| **Agent → Agent** | x402 Protocol (planned) | Inter-agent microservices | Small amounts, automated, frequent calls, streaming payment |

**Why Two Protocols?**
- User payments need **security + oversight** (escrow + 5-minute human-in-the-loop)
- Agent-to-agent payments need **speed + automation** (micropayments without blocking)

**x402 Integration Plan**
- Agent A calls Agent B's endpoint
- x402 payment authorization attached to request
- Automatic settlement upon successful response
- Enables "pay-per-use" agent microservices economy

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
wrangler kv namespace create AGENTX_KV
# Update wrangler.toml with KV namespace ID
wrangler secret put PRIVATE_KEY
wrangler deploy
```

---

## Team

Built solo for the X Layer × Solana dual hackathon.

---

*Generated: 2025-03-24*
