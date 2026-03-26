/**
 * Contract addresses and ABIs for X Layer
 */

export const CONTRACTS = {
  taskManager: "0x39223444d2f9a4d6769e91aa7908CB22CA3A8686",
  paymentHub: "0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60",
  usdc: "0xAdaA7CE9dadB185332D76Caea2a8647F685a667d",
  agentRegistry8004: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
};

export const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

export const PAYMENT_HUB_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "taskId", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      {
        components: [
          { internalType: "address", name: "agentOwner", type: "address" },
          { internalType: "uint256", name: "amount", type: "uint256" },
          { internalType: "string", name: "description", type: "string" },
        ],
        internalType: "struct PaymentHub.PaymentBreakdown[]",
        name: "breakdown",
        type: "tuple[]",
      },
    ],
    name: "createEscrow",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "escrowId", type: "bytes32" },
      { indexed: true, internalType: "uint256", name: "taskId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "EscrowCreated",
    type: "event",
  },
];

export const TASK_MANAGER_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "taskId", type: "uint256" }],
    name: "getTask",
    outputs: [{
      components: [
        { internalType: "uint256", name: "id", type: "uint256" },
        { internalType: "address", name: "requester", type: "address" },
        { internalType: "bytes32", name: "workflowHash", type: "bytes32" },
        { internalType: "bytes32[]", name: "agentDIDs", type: "bytes32[]" },
        { internalType: "uint256", name: "totalBudget", type: "uint256" },
        { internalType: "uint8", name: "status", type: "uint8" },
        { internalType: "uint256", name: "currentStepIndex", type: "uint256" },
        { internalType: "uint256", name: "createdAt", type: "uint256" },
        { internalType: "uint256", name: "updatedAt", type: "uint256" },
        { internalType: "uint256", name: "completedAt", type: "uint256" }
      ],
      internalType: "struct TaskManager.Task",
      name: "",
      type: "tuple"
    }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "taskId", type: "uint256" },
      { internalType: "bytes32", name: "stepId", type: "bytes32" },
      { internalType: "uint8", name: "status", type: "uint8" },
      { internalType: "bytes32", name: "outputHash", type: "bytes32" },
      { internalType: "string", name: "error", type: "string" }
    ],
    name: "recordStepCompletion",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "taskId", type: "uint256" },
      { indexed: true, internalType: "address", name: "requester", type: "address" },
      { indexed: false, internalType: "bytes32", name: "workflowHash", type: "bytes32" },
      { indexed: false, internalType: "uint256", name: "budget", type: "uint256" }
    ],
    name: "TaskCreated",
    type: "event"
  }
];
