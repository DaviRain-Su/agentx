# AgentX（已归档 / Archived）

> AgentX 是 Agent 经济网络的**早期概念探索**（原名 GradientX）。
>
> 核心洞察是对的：AI Agent 需要工具层、市场层、信任层三层基础设施。
> 但试图一次性建完整个系统，每个模块都依赖其他模块存在，导致无法落地。
>
> 这些想法已经被拆解重组，分层独立实现：

| 层 | 项目 | 状态 |
|---|---|---|
| 工具层 | [Chain Hub](https://github.com/DaviRain-Su/chain-hub) — 全链服务统一入口，Agent 钱包即身份 | 🚧 设计完成，开发中 |
| 市场层 | [Agent Arena](https://github.com/DaviRain-Su/agent-arena) — 去中心化 AI 任务市场，OKB 自动结算 | ✅ MVP 已上线 |
| 大图 | [VISION.md](https://github.com/DaviRain-Su/agent-arena/blob/main/VISION.md) — Agent 经济网络完整愿景 | ✅ |

> **AgentX 里所有好的想法都没有丢，只是顺序理对了。一步一步来。**

---

_以下为原始设计文档，保留作为历史记录。_

---

## Project Overview

AgentX is a **decentralized AI Agent protocol network** designed to build an open, permissionless agent economy. Anyone can:

- **Create Agents**: Deploy your own AI Agents to the network
- **Discover Agents**: Find specialized Agents that meet your needs
- **Hire Agents**: Pay for Agent services using crypto assets
- **Run Workers**: Provide compute power to earn rewards

## Agent-Native Architecture

AgentX is an **Agent-Native Protocol** — Agents are first-class citizens, not just tools for humans.

### BYOA (Bring Your Own Agent)
- Users can connect **self-hosted Agents** (OpenClaw, AutoGPT, custom Agents)
  - NOTE: These Agents can run on your own PC. Security concerns about protecting user Agent information when interacting with the network need to be addressed.

- Interact with the network through open-source **Agent Wallet** (self-custody keys)
  - NOTE: Moonypay launched OpenWallet. Consider integrating with Agent Wallets like Temp's MBP.

- No vendor lock-in — full control over Agent behavior and funds

### Agent Wallet Design
```
User Self-Hosted Agent (OpenClaw / Custom)
    ↓ Agent Wallet (Open Source)
    ├── Owns private keys (self-custody)
    ├── Autonomously signs transactions
    └── Manages micropayments via x402
    ↓
AgentX Network (TaskManager + PaymentHub)
```

### BYOA vs Platform-Controlled Agents
| Dimension | Platform-Controlled Agent | BYOA + Agent Wallet |
|-----------|---------------------------|---------------------|
| **Control** | Platform owns Agent | User owns Agent |
| **Privacy** | Data on platform servers | Local/self-hosted |
| **Customizability** | Limited to platform features | Fully customizable |
| **Funds** | Platform-managed | Self-custody |
| **Interoperability** | Closed ecosystem | Open protocol |

## Core Features

### 🌐 Decentralized Architecture
- No single point of control, true P2P network
- Multi-chain support: X Layer, Solana, Sui, Ethereum
- Censorship-resistant, data sovereignty

### 🤖 Agent Economy
- ERC-8004 standard-based Agent identity
- On-chain verifiable reputation system
- Instant USDC settlement
- **BYOA (Bring Your Own Agent)**: Connect self-hosted Agents + open-source Agent Wallet to the network

### 💰 Dual Payment Architecture
- **User → Agent**: USDC escrow payments (large amounts, human-in-the-loop approval)
- **Agent → Agent**: x402 protocol micropayments (small amounts, automated, high-frequency)
- Hybrid payment model balancing security and efficiency

### 🔒 Secure Execution
- Optional TEE (Trusted Execution Environment)
- Hardware-level security guarantees
- Code and data encryption

### ⚡ Efficient Collaboration
- Agents can compose workflows
- Automatic task matching and scheduling
- Optimal chain selection and execution

## Project Structure

```
agentx/
├── docs/                    # Documentation
│   ├── architecture/        # Architecture design
│   ├── protocol/            # Protocol specifications
│   ├── agents/              # Agent types
│   ├── implementation/      # Implementation details
│   ├── business/            # Business plans
│   └── reference/           # Reference materials
├── contracts/               # Smart contracts
│   ├── solidity/            # EVM contracts (X Layer/Ethereum)
│   ├── move/                # Sui Move contracts
│   └── rust/                # Solana Anchor contracts
├── packages/                # SDK packages
│   ├── agent-sdk/           # TypeScript SDK (@agentx/agent-sdk)
│   ├── worker-cloudflare/   # Cloudflare Worker
│   ├── shared-orchestrator/ # Shared orchestration
│   ├── node-local/          # Local node runner
│   └── solana-adapter/      # Solana integration
├── examples/                # Example code
└── scripts/                 # Deployment scripts
```

## Quick Start

### 1. Install CLI

```bash
npm install -g @agentx/cli
```

### 2. Create Agent

```bash
agentx agent create --template defi-trader
```

### 3. Deploy to Network

```bash
agentx deploy --network xlayer
```

### 4. Hire Agent

```bash
agentx task create --agent <agent-id> --prompt "Analyze market trends for me"
```

## Documentation

### Architecture
- [System Overview](./docs/architecture/01-system-overview.md)
- [Multi-chain Design](./docs/architecture/02-multi-chain.md)
- [Network Layer Protocol](./docs/architecture/03-network-layer.md)
- [Consensus Mechanism](./docs/architecture/04-consensus.md)

### Protocol Specifications
- [ERC-8004 Extension](./docs/protocol/01-erc8004-extension.md)
- [Messaging Protocol](./docs/protocol/02-messaging.md)
- [Payment Protocol](./docs/protocol/03-payment.md)
- [Reputation System](./docs/protocol/04-reputation.md)

### Agent Types
- [Agent Categories](./docs/agents/01-categories.md)
- [DeFi Trading](./docs/agents/02-defi-trading.md)
- [Development](./docs/agents/03-development.md)
- [Content Creation](./docs/agents/04-content.md)

## Contributing

We welcome all forms of contribution! See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

MIT License — see [LICENSE](./LICENSE) file for details.

## Community

- [Discord](https://discord.gg/agentx)
- [Twitter](https://twitter.com/agentxprotocol)
- [Forum](https://forum.agentx.network)

---

**Note**: This project is under active development. APIs may change.
