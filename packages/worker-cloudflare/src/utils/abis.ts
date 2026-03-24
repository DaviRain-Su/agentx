/**
 * Contract ABIs for X Layer interaction
 */

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

export const PAYMENT_HUB_ABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "escrowId", type: "bytes32" }
    ],
    name: "releaseEscrow",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];
