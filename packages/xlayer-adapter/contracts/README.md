# X Layer Contract Deployment

## Quick Start

### 1. Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 2. Install Dependencies

```bash
make install
# or
forge install
```

### 3. Create Wallet

**Option A: Use make command**
```bash
make create-wallet
```

**Option B: Use cast**
```bash
cast wallet new
```

**Output:**
```
Address: 0x1234...
Private Key: 0xabcd...
```

### 4. Fund Wallet

Get X Layer testnet ETH from:
- https://www.okx.com/xlayer/faucet

### 5. Configure Environment

```bash
cp .env.example .env
# Edit .env and add your private key
```

### 6. Deploy

```bash
make deploy
```

Or manually:
```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://rpc.xlayer.tech/testnet \
  --broadcast \
  --verify \
  -vvvv
```

## Contract Architecture

```
┌─────────────────────────────────────────┐
│         Charlie 8004 Agent Registry      │
│         (Already deployed on X Layer)    │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         TaskManager (Our Contract)       │
│  - Workflow lifecycle management         │
│  - Human-in-the-loop confirmations       │
│  - Step execution tracking               │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         PaymentHub (Our Contract)        │
│  - USDC escrow                           │
│  - Payment release/refund                │
│  - Platform fee collection               │
└─────────────────────────────────────────┘
```

## Contract Addresses (Testnet)

After deployment, update this section:

| Contract | Address | Status |
|----------|---------|--------|
| TaskManager | `0x...` | ⏳ Pending |
| PaymentHub | `0x...` | ⏳ Pending |

## X Layer Testnet Info

- **Network Name**: X Layer Testnet
- **RPC URL**: https://rpc.xlayer.tech/testnet
- **Chain ID**: 195
- **Currency Symbol**: OKB
- **Block Explorer**: https://www.oklink.com/xlayer-test

## Verification

Contracts are automatically verified during deployment with `--verify` flag.

Manual verification:
```bash
make verify
```

## Testing Locally

Start local fork:
```bash
make anvil
```

Deploy to local:
```bash
make deploy-local
```
