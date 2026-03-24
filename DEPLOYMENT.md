# Gradience Deployment Information

## X Layer Testnet Deployment

**Date:** 2024-03-23  
**Deployer:** 0x067aBc270C4638869Cd347530Be34cBdD93D0EA1

### Contract Addresses

| Contract | Address | Explorer |
|----------|---------|----------|
| TaskManager | `0x39223444d2f9a4d6769e91aa7908CB22CA3A8686` | [View](https://www.oklink.com/x-layer-testnet/address/0x39223444d2f9a4d6769e91aa7908CB22CA3A8686) |
| PaymentHub | `0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60` | [View](https://www.oklink.com/x-layer-testnet/address/0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60) |

### External Dependencies

| Contract | Address | Source |
|----------|---------|--------|
| 8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | [8004scan](https://www.8004scan.io/networks) |
| 8004 Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | [8004scan](https://www.8004scan.io/networks) |
| USDC | `0x67d0E8F4Ef68D739893209bA018273a8F5FF845E` | X Layer Testnet |

### Network Configuration

- **Network:** X Layer Testnet
- **Chain ID:** 1952
- **RPC URL:** https://xlayertestrpc.okx.com
- **Explorer:** https://www.oklink.com/x-layer-testnet

### Features Deployed

✅ TaskManager
- Workflow lifecycle management
- Human-in-the-loop confirmations
- Step execution tracking
- Integration with 8004 Agent Registry

✅ PaymentHub
- USDC escrow for tasks
- Payment release/refund
- Platform fee collection (10%)
- Integration with TaskManager

### Next Steps

1. Verify contracts on OKLink explorer
2. Update frontend with contract addresses
3. Test workflow creation and execution
4. Document integration with Charlie (8004)
