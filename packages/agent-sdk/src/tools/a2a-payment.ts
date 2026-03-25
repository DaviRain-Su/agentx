/**
 * createA2APaymentTool — Agent-to-Agent USDC payment tool.
 *
 * Implements the x402-style A2A protocol:
 *   1. Transfer USDC from the caller's agent wallet to a target agent wallet.
 *   2. Wait 1 block for on-chain confirmation.
 *   3. Return txHash + explorerUrl as payment proof.
 *
 * The agent that owns this tool acts as the payer. The target agent's
 * wallet address can be discovered via createAgentMarketTool.
 */

import { Type, type Static } from "@sinclair/typebox";
import { ethers } from "ethers";

export interface A2APaymentConfig {
  /** The payer's private key (derived from masterKey + agentName) */
  privateKey: string;
  /** X Layer (or any EVM) RPC endpoint */
  rpcUrl: string;
  /** USDC contract address */
  usdcAddress: string;
}

export interface A2APaymentResult {
  txHash: string;
  blockNumber: number;
  from: string;
  to: string;
  amount: string;
  explorerUrl: string;
}

const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

const paySchema = Type.Object({
  to: Type.String({ description: "Target agent wallet address" }),
  amount: Type.String({ description: "USDC amount to pay (e.g. '0.001')" }),
  memo: Type.Optional(Type.String({ description: "Optional memo describing what the payment is for" })),
});

export function createA2APaymentTool(config: A2APaymentConfig) {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const usdc = new ethers.Contract(config.usdcAddress, USDC_ABI, wallet);

  return {
    name: "a2a_pay" as const,
    label: "a2a_pay",
    description:
      "Pay another agent in USDC via Agent-to-Agent (A2A) payment. " +
      "Transfers USDC on-chain and returns a verifiable txHash. " +
      "Use this to hire a specialist agent before calling its service.",
    parameters: paySchema,
    execute: async (_id: string, { to, amount, memo }: Static<typeof paySchema>) => {
      const amountWei = ethers.parseUnits(amount, 6);

      // Check balance first
      const balance: bigint = await usdc.balanceOf(wallet.address);
      if (balance < amountWei) {
        const balStr = ethers.formatUnits(balance, 6);
        return {
          content: [{
            type: "text" as const,
            text: `Insufficient USDC balance: have ${balStr}, need ${amount}. Cannot pay agent.`,
          }],
          details: { error: "insufficient_balance", balance: balStr, required: amount },
        };
      }

      const tx = await usdc.transfer(to, amountWei);
      const receipt = await tx.wait(1);

      const result: A2APaymentResult = {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: wallet.address,
        to,
        amount,
        explorerUrl: `https://www.oklink.com/x-layer-testnet/tx/${receipt.hash}`,
      };

      const memoNote = memo ? ` (${memo})` : "";
      return {
        content: [{
          type: "text" as const,
          text: [
            `✅ A2A payment confirmed${memoNote}`,
            `  From: ${result.from}`,
            `  To:   ${result.to}`,
            `  Amount: ${amount} USDC`,
            `  TxHash: ${result.txHash}`,
            `  Block: ${result.blockNumber}`,
            `  Explorer: ${result.explorerUrl}`,
          ].join("\n"),
        }],
        details: result,
      };
    },
  };
}
