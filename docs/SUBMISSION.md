# AgentX — XLayer Hackathon Submission

## Project Overview

**AgentX** is a decentralized AI Agent economic network where autonomous agents discover, hire, pay, and collaborate with each other on-chain. Agents run on Cloudflare Workers with real USDC micro-payments settled on X Layer.

### Core Innovation

> Agents pay agents. Not humans paying for API calls — agents autonomously hiring other agents with real on-chain USDC transfers.

---

## Live Demo

| Component | URL |
|-----------|-----|
| **Worker API** | `https://agentx-worker.davirain-yin.workers.dev` |
| **Health Check** | `https://agentx-worker.davirain-yin.workers.dev/health` |
| **Agent Network** | `https://agentx-worker.davirain-yin.workers.dev/api/agents` |

### Live Agent Addresses (X Layer Testnet)

| Agent | Address | Fee | Role |
|-------|---------|-----|------|
| **Orchestrator** | `0xbE24E6aa9063a7d4885E84E2427Ec6aE31144Ee0` | 0.002 USDC | Coordinates workflow, hires agents, manages payments |
| **Price Oracle** | `0x1DAaE012c914bb010D2bD5aF3a90d5b0D4cf0ff7` | 0.001 USDC | Real-time crypto prices (Binance + CoinGecko) |
| **Trade Strategy** | `0x21c89513dFd1f9639e7A4CF1ca518c971430a756` | 0.005 USDC | Risk assessment, trade recommendations |

---

## Deployed Contracts (X Layer Testnet, Chain ID 195)

| Contract | Address | Source |
|----------|---------|--------|
| **TaskManager** | `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686` | `packages/xlayer-adapter/contracts/TaskManager.sol` |
| **PaymentHub** | `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60` | `packages/xlayer-adapter/contracts/PaymentHub.sol` |
| **AgentRegistry (ERC-8004)** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | External |
| **USDC (Testnet)** | `0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d` | ERC-20 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Browser (Next.js 14)                    │
│              OKX Wallet / MetaMask  ←→  X Layer Testnet          │
└──────────────┬──────────────────────────────────────┬────────────┘
               │ USDC approve + createTask            │ Chat / WS
               ▼                                      ▼
┌──────────────────────┐          ┌────────────────────────────────┐
│  Smart Contracts      │          │  Cloudflare Worker              │
│  (X Layer Testnet)    │          │  agentx-worker.workers.dev      │
│                       │          │                                  │
│  TaskManager.sol      │◄────────►│  A2A Payment Workflow (Durable) │
│  PaymentHub.sol       │          │    Step 1: validate addresses   │
│  AgentRegistry.sol    │          │    Step 2: collect USDC budget  │
│                       │          │    Step 3: pay PriceOracle      │
│  USDC.sol (ERC-20)    │          │    Step 4: pay TradeStrategy    │
│                       │          │    Step 5: refund remainder     │
└──────────────────────┘          │                                  │
                                   │  Agent Session (Durable Object) │
                                   │    AI Chat via CF AI Gateway     │
                                   │    Tools: price, trade, files    │
                                   │                                  │
                                   │  Node Registry (KV)              │
                                   │    Anyone can register a node    │
                                   └────────────────────────────────┘
```

### A2A Payment Flow (5 Atomic Steps)

Each step is a **Cloudflare Durable Workflow step** — individually retried on failure, no double-spend:

```
User ──USDC──► Orchestrator ──0.001 USDC──► PriceOracle (fetches ETH price)
                             ──0.005 USDC──► TradeStrategy (analyzes risk)
                             ──remainder───► User (automatic refund)
```

Every payment is a **real USDC transfer on X Layer Testnet** with verifiable tx hashes on [OKLink Explorer](https://www.oklink.com/x-layer-testnet).

---

## Agent Wallet Architecture

### Current Implementation (MVP)

The current MVP uses **deterministic wallet derivation** for simplicity:

```typescript
// All agent wallets derived from a single master key
agentPrivateKey = keccak256(masterKey + ":" + agentName)
agentWallet = new ethers.Wallet(agentPrivateKey)
```

**Why this approach for MVP:**
- Zero infrastructure overhead — no key management service needed
- Deterministic — same master key always produces the same agent addresses
- All agents can be managed from a single Cloudflare Worker secret
- Sufficient for demonstrating the A2A payment protocol

**Known limitations (intentional trade-offs for hackathon scope):**
- Single point of failure — master key compromise affects all agents
- Centralized custody — Cloudflare holds signing authority
- No per-agent revocation — can't disable one agent without rotating all
- Not suitable for a multi-operator network

### Production Roadmap: Agent Wallet Evolution

We explicitly designed the wallet layer as a **pluggable abstraction** in the `AgentX` base class. The production roadmap has three phases:

```
Phase 1 (Current MVP)          Phase 2 (Post-Hackathon)       Phase 3 (Production)
─────────────────────          ────────────────────────        ────────────────────
Deterministic Derivation  →    Per-Agent Keys + AA Wallet  →  TEE-Backed Wallets
                                                               
Single master key              Each agent owns its key        Keys generated inside TEE
All agents in one Worker       ERC-4337 Smart Accounts        Remote attestation proves
keccak256(master:name)         Session keys with limits       agent runs in secure enclave
                               Time-bound, revocable          Key never leaves hardware
                               On-chain permission mgmt       Fully trustless execution
```

**Phase 2: Per-Agent Keys + Account Abstraction**
- Each agent gets an independent keypair
- ERC-4337 Smart Account per agent (X Layer supports this)
- Session keys with spending limits and expiry
- Agent owner can revoke/rotate individual agent keys
- Enables BYOA (Bring Your Own Agent) — users run their own agents with self-custody

**Phase 3: TEE-Backed Agent Wallets**
- Agent keys generated inside Trusted Execution Environment (Intel SGX / AWS Nitro)
- On-chain attestation proves the agent code and key are in a secure enclave
- Private key **never** leaves the hardware boundary
- Enables truly trustless, decentralized agent execution
- Anyone can verify what code an agent is running before hiring it

### Why This Matters

The Agent Wallet is the **core trust primitive** of a decentralized agent economy:

| Property | Why It Matters |
|----------|---------------|
| **Self-Custody** | Agents control their own funds — no platform can freeze or seize |
| **Verifiable Identity** | On-chain address = provable agent identity via ERC-8004 |
| **Permission Scoping** | Smart Account limits what an agent can spend/do |
| **Trustless Hiring** | User verifies agent's TEE attestation before paying |
| **Composability** | Any agent can hire any other agent — permissionless economy |

The current MVP demonstrates the **payment protocol and economic mechanics** correctly. The wallet layer is designed to be upgraded without changing the A2A payment flow.

---

## Key Features

### 1. Agent-to-Agent (A2A) Payments
- Real USDC transfers between autonomous agent wallets
- 5-step atomic workflow with automatic retry and refund
- Every payment verifiable on X Layer block explorer

### 2. AI Agent Sessions
- Durable Object per session with SQLite persistence
- CF AI Gateway → Llama 3.3 70B (free tier, swappable to any model)
- Built-in tools: real-time price feed, condition evaluation, trade preparation
- WebSocket support for streaming responses

### 3. Decentralized Node Registry
- Any operator can register a compute node via API key
- Nodes declare capabilities, model, and endpoint
- Heartbeat-based liveness with 5-minute TTL
- Foundation for multi-operator agent execution network

### 4. On-Chain Task Management
- `TaskManager.sol` — workflow lifecycle with human-in-the-loop confirmation
- `PaymentHub.sol` — USDC escrow with per-agent settlement breakdown
- Integration with ERC-8004 Agent Registry for agent DIDs

### 5. Frontend Dashboard
- Next.js 14 App Router + Tailwind CSS
- Multi-wallet: OKX Wallet + MetaMask on X Layer Testnet
- Agent Marketplace (chat, hire, pay)
- Workflow builder with budget control
- Task monitor with A2A payment chain visualization
- Chinese/English bilingual

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.20, Foundry, OpenZeppelin |
| Agent Runtime | Cloudflare Workers, Durable Objects, KV |
| AI | CF AI Gateway → Llama 3.3 70B (swappable) |
| Agent SDK | TypeScript, ethers.js v6 |
| Frontend | Next.js 14, React 18, Tailwind CSS, ethers.js v6 |
| Blockchain | X Layer Testnet (Chain ID 195) |

---

## Repository Structure

```
packages/
├── agent-sdk/                  # AgentX base class, wallet derivation, USDC payment
├── worker-cloudflare/          # CF Worker: A2A workflow, agent sessions, node registry
├── shared-orchestrator/        # DAG engine, runtime abstraction, state management
├── xlayer-adapter/
│   ├── frontend/               # Next.js dashboard (Vercel)
│   └── contracts/              # TaskManager.sol, PaymentHub.sol, TeamRegistry.sol
└── node-local/                 # Local node runner (dev/testing)
```

---

## Running the Demo

```bash
# 1. Agent SDK (build first)
cd packages/agent-sdk && npm run build

# 2. Cloudflare Worker (already deployed)
cd packages/worker-cloudflare && npm run dev

# 3. Frontend
cd packages/xlayer-adapter/frontend && npm run dev
# → http://localhost:3000
```

### Quick API Test
```bash
# Health check
curl https://agentx-worker.davirain-yin.workers.dev/health

# View live agent addresses
curl https://agentx-worker.davirain-yin.workers.dev/api/agents

# Simulate A2A payment flow
curl -X POST https://agentx-worker.davirain-yin.workers.dev/api/a2a/simulate \
  -H "Content-Type: application/json" \
  -d '{"symbol":"ETH","budget":0.01}'

# Deploy an agent session and chat
curl -X POST https://agentx-worker.davirain-yin.workers.dev/api/deploy \
  -H "Content-Type: application/json" \
  -d '{"template":"orchestrator"}'
```

---

## Team

Solo builder for the X Layer Hackathon.

---

*Updated: 2025-03-26*
