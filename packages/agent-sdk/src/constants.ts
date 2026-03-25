/** X Layer Testnet chain configuration and deployed contract addresses */
export const XLAYER_TESTNET = {
  chainId: 195,
  rpc: "https://xlayertestrpc.okx.com",
  explorer: "https://www.oklink.com/x-layer-testnet",
  contracts: {
    usdc:          "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
    taskManager:   "0x39223444d2f9a4d6769e91aa7908CB22CA3A8686",
    paymentHub:    "0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60",
    agentRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  },
} as const;
