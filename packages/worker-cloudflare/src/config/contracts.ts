/**
 * Contract addresses and ABIs for X Layer
 */

export const CONTRACTS = {
  taskManager: "0x39223444d2f9a4d6769e91aa7908CB22CA3A8686",
  paymentHub: "0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60",
  usdc: "0x67d0E8f4Ef68D739893209bA018273a8F5FF845E",
  agentRegistry8004: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
};

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
