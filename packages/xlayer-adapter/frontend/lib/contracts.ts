import { ethers } from 'ethers';

// Helper to validate and checksum addresses
const getAddress = (addr: string): string => {
  try {
    const normalized = String(addr || "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
      throw new Error("invalid hex length");
    }
    return ethers.getAddress(normalized.toLowerCase());
  } catch (e) {
    console.warn(`Invalid address: ${addr}`);
    return ethers.ZeroAddress;
  }
};

// Contract Addresses (with checksum validation)
export const CONTRACTS = {
  taskManager: getAddress(process.env.NEXT_PUBLIC_TASK_MANAGER_ADDRESS || '0x39223444d2f9a4d6769e91aa7908CB22CA3A8686'),
  paymentHub: getAddress(process.env.NEXT_PUBLIC_PAYMENT_HUB_ADDRESS || '0x6FAeAD7A1cF50Bd81B82446737E0A27F43573a60'),
  usdc: getAddress('0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d'),
  agentRegistry8004: getAddress('0x8004A818BFB912233c491871b3d84c89A494BD9e'),
};

// Multi-RPC endpoints for redundancy
export const RPC_ENDPOINTS = [
  'https://testrpc.xlayer.tech/terigon',
  'https://xlayertestrpc.okx.com/terigon',
];

// TaskManager ABI (simplified)
export const TASK_MANAGER_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "_agentRegistry8004", "type": "address"}],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {"internalType": "bytes32", "name": "workflowHash", "type": "bytes32"},
      {"internalType": "bytes32[]", "name": "agentDIDs", "type": "bytes32[]"},
      {"internalType": "uint256", "name": "totalBudget", "type": "uint256"}
    ],
    "name": "createTask",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "taskId", "type": "uint256"}],
    "name": "cancelTask",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "taskId", "type": "uint256"}],
    "name": "getTask",
    "outputs": [{
      "components": [
        {"internalType": "uint256", "name": "id", "type": "uint256"},
        {"internalType": "address", "name": "requester", "type": "address"},
        {"internalType": "bytes32", "name": "workflowHash", "type": "bytes32"},
        {"internalType": "bytes32[]", "name": "agentDIDs", "type": "bytes32[]"},
        {"internalType": "uint256", "name": "totalBudget", "type": "uint256"},
        {"internalType": "uint8", "name": "status", "type": "uint8"},
        {"internalType": "uint256", "name": "currentStepIndex", "type": "uint256"},
        {"internalType": "uint256", "name": "createdAt", "type": "uint256"},
        {"internalType": "uint256", "name": "updatedAt", "type": "uint256"},
        {"internalType": "uint256", "name": "completedAt", "type": "uint256"}
      ],
      "internalType": "struct TaskManager.Task",
      "name": "",
      "type": "tuple"
    }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "requester", "type": "address"}],
    "name": "getRequesterTasks",
    "outputs": [{"internalType": "uint256[]", "name": "", "type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "uint256", "name": "taskId", "type": "uint256"},
      {"indexed": true, "internalType": "address", "name": "requester", "type": "address"},
      {"indexed": false, "internalType": "bytes32", "name": "workflowHash", "type": "bytes32"},
      {"indexed": false, "internalType": "uint256", "name": "budget", "type": "uint256"}
    ],
    "name": "TaskCreated",
    "type": "event"
  }
];

// PaymentHub ABI (simplified)
export const PAYMENT_HUB_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "_usdc", "type": "address"},
      {"internalType": "address", "name": "_feeRecipient", "type": "address"}
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {"internalType": "uint256", "name": "taskId", "type": "uint256"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"},
      {
        "components": [
          {"internalType": "address", "name": "agentOwner", "type": "address"},
          {"internalType": "uint256", "name": "amount", "type": "uint256"},
          {"internalType": "string", "name": "description", "type": "string"}
        ],
        "internalType": "struct PaymentHub.PaymentBreakdown[]",
        "name": "breakdown",
        "type": "tuple[]"
      }
    ],
    "name": "createEscrow",
    "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "bytes32", "name": "escrowId", "type": "bytes32"},
      {"indexed": true, "internalType": "uint256", "name": "taskId", "type": "uint256"},
      {"indexed": true, "internalType": "address", "name": "requester", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "EscrowCreated",
    "type": "event"
  }
];

// USDC ABI (ERC20)
export const USDC_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"},
      {"internalType": "address", "name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  }];
