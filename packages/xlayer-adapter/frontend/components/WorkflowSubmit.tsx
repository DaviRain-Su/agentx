"use client";

import { useState } from "react";
import { useWeb3 } from "./Web3Provider";
import { useWorkflowStore } from "@/store/workflow";
import { ethers } from "ethers";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export function WorkflowSubmit() {
  const { taskManager, usdc, isConnected, address } = useWeb3();
  const { steps, executionMode } = useWorkflowStore();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  const totalCost = steps.reduce((sum, step) => {
    // Calculate based on agent level
    const prices: Record<string, number> = {
      "price-monitor": 0.2,
      "condition-eval": 0.5,
      "trade-executor": 0.5,
    };
    return sum + (prices[step.agentId] || 0.5);
  }, 0);

  const handleSubmit = async () => {
    if (!taskManager || !usdc || !address) {
      setError("Please connect wallet first");
      return;
    }

    if (steps.length === 0) {
      setError("Please add at least one step");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Generate workflow hash (simplified)
      const workflowData = JSON.stringify({
        steps: steps.map(s => ({ id: s.id, agentId: s.agentId, config: s.config })),
        mode: executionMode,
        createdAt: Date.now(),
      });
      const workflowHash = ethers.keccak256(ethers.toUtf8Bytes(workflowData));

      // 2. Get agent DIDs from 8004 registry (simplified - using placeholder)
      const agentDIDs = steps.map(() => 
        ethers.keccak256(ethers.toUtf8Bytes("agent_did_placeholder"))
      );

      // 3. Calculate total budget in USDC (6 decimals)
      const totalBudget = ethers.parseUnits(totalCost.toString(), 6);

      // 4. Check USDC balance
      const balance = await usdc.balanceOf(address);
      if (balance < totalBudget) {
        throw new Error(`Insufficient USDC balance. Need ${totalCost} USDC`);
      }

      // 5. Approve USDC spending
      const approveTx = await usdc.approve(
        await taskManager.getAddress(),
        totalBudget
      );
      await approveTx.wait();

      // 6. Create task
      const tx = await taskManager.createTask(
        workflowHash,
        agentDIDs,
        totalBudget
      );
      
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      
      // Extract task ID from event (simplified)
      setTaskId(receipt?.blockNumber?.toString() || "unknown");
      
    } catch (err: any) {
      console.error("Submit failed:", err);
      setError(err.message || "Failed to create workflow");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
        Please connect your wallet to create workflows.
      </div>
    );
  }

  if (txHash) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-green-800 mb-2">
          Workflow Created!
        </h3>
        <p className="text-sm text-green-700 mb-4">
          Task ID: {taskId}
        </p>
        <a
          href={`https://www.oklink.com/x-layer-testnet/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline text-sm"
        >
          View Transaction →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">Total Steps</span>
          <span className="font-semibold">{steps.length}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">Execution Mode</span>
          <span className="font-semibold capitalize">{executionMode}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-gray-600">Total Cost</span>
          <span className="font-bold text-lg">${totalCost.toFixed(2)} USDC</span>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || steps.length === 0}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Creating Workflow...
          </>
        ) : (
          "Create Workflow"
        )}
      </button>
    </div>
  );
}
