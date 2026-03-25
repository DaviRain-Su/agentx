import { ethers } from "ethers";
import { CONTRACTS, USDC_ABI } from "../../config/contracts";

function deriveAgentWallet(masterKey: string, agentName: string, provider: ethers.JsonRpcProvider): ethers.Wallet {
  const walletSeed = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
  return new ethers.Wallet(walletSeed, provider);
}

export async function payAgent(
  orchestratorWallet: ethers.Wallet,
  agentName: string,
  amountUsdc: string,
  provider: ethers.JsonRpcProvider
): Promise<{ txHash: string; agentAddress: string; paid: boolean; reason?: string }> {
  const agentWallet = deriveAgentWallet(orchestratorWallet.privateKey, agentName, provider);
  try {
    const usdc = new ethers.Contract(CONTRACTS.usdc, USDC_ABI, orchestratorWallet);
    const amount = ethers.parseUnits(amountUsdc, 6);
    const balance = await usdc.balanceOf(orchestratorWallet.address);
    if (balance < amount) {
      return { txHash: "", agentAddress: agentWallet.address, paid: false, reason: "insufficient USDC balance (demo mode)" };
    }
    const tx = await usdc.transfer(agentWallet.address, amount);
    const receipt = await tx.wait(1);
    return { txHash: receipt.hash, agentAddress: agentWallet.address, paid: true };
  } catch (err) {
    return { txHash: "", agentAddress: agentWallet.address, paid: false, reason: String(err) };
  }
}
