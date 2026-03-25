/**
 * createTaskManagerTool — On-chain task lifecycle management.
 *
 * Wraps the Gradience TaskManager contract (X Layer Testnet):
 *   - create_task: Submit a new AI task with USDC budget
 *   - get_task: Read current task status and progress
 *   - complete_task: Mark task completed and trigger PaymentHub settlement
 *
 * Tasks follow the state machine: created → executing → completed | failed
 */

import { Type, type Static } from "@sinclair/typebox";
import { ethers } from "ethers";

export interface TaskManagerConfig {
  privateKey: string;
  rpcUrl: string;
  taskManagerAddress: string;
  usdcAddress: string;
  paymentHubAddress?: string;
}

const TASK_MANAGER_ABI = [
  "function createTask(string description, uint256 budget, address assignee) returns (uint256)",
  "function getTask(uint256 taskId) view returns (address requester, string description, uint256 budget, uint8 status, uint256 createdAt)",
  "function updateTaskStatus(uint256 taskId, uint8 status) returns (bool)",
  "function getRequesterTasks(address requester) view returns (uint256[])",
  "event TaskCreated(uint256 indexed taskId, address indexed requester, string description, uint256 budget)",
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];

const TASK_STATUSES = ["created", "pending_confirmation", "executing", "completed", "failed", "cancelled"];

const createSchema = Type.Object({
  description: Type.String({ description: "Task description — what the agent should do" }),
  budget: Type.String({ description: "USDC budget for the task (e.g. '0.01')" }),
  assignee: Type.Optional(Type.String({ description: "Agent wallet address to assign the task to" })),
});

const getSchema = Type.Object({
  taskId: Type.Number({ description: "On-chain task ID" }),
});

const listSchema = Type.Object({
  requester: Type.Optional(Type.String({ description: "Wallet address to list tasks for (defaults to own wallet)" })),
});

export function createTaskManagerTool(config: TaskManagerConfig) {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const taskManager = new ethers.Contract(config.taskManagerAddress, TASK_MANAGER_ABI, wallet);
  const usdc = new ethers.Contract(config.usdcAddress, USDC_ABI, wallet);

  const createTool = {
    name: "create_task" as const,
    label: "create_task",
    description:
      "Create a new on-chain AI task with a USDC budget. " +
      "Approves USDC allowance and submits the task to the TaskManager contract. " +
      "Returns taskId and txHash for tracking.",
    parameters: createSchema,
    execute: async (_id: string, { description, budget, assignee }: Static<typeof createSchema>) => {
      try {
        const budgetWei = ethers.parseUnits(budget, 6);

        // Approve USDC spend if needed
        const allowance: bigint = await usdc.allowance(wallet.address, config.taskManagerAddress);
        if (allowance < budgetWei) {
          const approveTx = await usdc.approve(config.taskManagerAddress, budgetWei);
          await approveTx.wait(1);
        }

        const assigneeAddr = assignee || ethers.ZeroAddress;
        const tx = await taskManager.createTask(description, budgetWei, assigneeAddr);
        const receipt = await tx.wait(1);

        // Extract taskId from TaskCreated event
        let taskId = 0;
        for (const log of receipt.logs) {
          try {
            const parsed = taskManager.interface.parseLog(log);
            if (parsed?.name === "TaskCreated") {
              taskId = Number(parsed.args.taskId);
              break;
            }
          } catch { /* skip */ }
        }

        return {
          content: [{
            type: "text" as const,
            text: [
              `✅ Task created on-chain`,
              `  Task ID: ${taskId}`,
              `  Budget: ${budget} USDC`,
              `  TxHash: ${receipt.hash}`,
              `  Explorer: https://www.oklink.com/x-layer-testnet/tx/${receipt.hash}`,
            ].join("\n"),
          }],
          details: { taskId, budget, txHash: receipt.hash, blockNumber: receipt.blockNumber },
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Failed to create task: ${(err as Error).message}` }],
          details: { error: (err as Error).message },
        };
      }
    },
  };

  const getTool = {
    name: "get_task" as const,
    label: "get_task",
    description:
      "Read the current status of an on-chain task. " +
      "Returns requester, description, budget, and status (created/executing/completed/failed).",
    parameters: getSchema,
    execute: async (_id: string, { taskId }: Static<typeof getSchema>) => {
      try {
        const t = await taskManager.getTask(taskId);
        const status = TASK_STATUSES[Number(t.status)] || `unknown(${t.status})`;
        const budget = ethers.formatUnits(t.budget, 6);
        const createdAt = new Date(Number(t.createdAt) * 1000).toISOString();

        return {
          content: [{
            type: "text" as const,
            text: [
              `Task #${taskId}:`,
              `  Status: ${status}`,
              `  Budget: ${budget} USDC`,
              `  Requester: ${t.requester}`,
              `  Created: ${createdAt}`,
              `  Description: ${t.description}`,
            ].join("\n"),
          }],
          details: { taskId, status, budget, requester: t.requester, description: t.description, createdAt },
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Failed to get task ${taskId}: ${(err as Error).message}` }],
          details: { taskId, error: (err as Error).message },
        };
      }
    },
  };

  const listTool = {
    name: "list_tasks" as const,
    label: "list_tasks",
    description:
      "List all on-chain tasks for a wallet address. " +
      "Defaults to the current agent's wallet if no address is provided.",
    parameters: listSchema,
    execute: async (_id: string, { requester }: Static<typeof listSchema>) => {
      try {
        const addr = requester || wallet.address;
        const ids: bigint[] = await taskManager.getRequesterTasks(addr);

        if (ids.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No tasks found for ${addr}` }],
            details: { requester: addr, tasks: [] },
          };
        }

        const tasks = [];
        for (const id of ids.slice(0, 20)) {
          try {
            const t = await taskManager.getTask(Number(id));
            tasks.push({
              taskId: Number(id),
              status: TASK_STATUSES[Number(t.status)] || "unknown",
              budget: ethers.formatUnits(t.budget, 6),
              description: t.description.slice(0, 60),
            });
          } catch { /* skip */ }
        }

        const lines = tasks.map(t => `  [${t.taskId}] ${t.status} | ${t.budget} USDC | ${t.description}`);
        return {
          content: [{ type: "text" as const, text: `Tasks for ${addr}:\n${lines.join("\n")}` }],
          details: { requester: addr, tasks },
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Failed to list tasks: ${(err as Error).message}` }],
          details: { error: (err as Error).message },
        };
      }
    },
  };

  return [createTool, getTool, listTool] as const;
}
