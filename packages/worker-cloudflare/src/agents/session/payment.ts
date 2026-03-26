import { ethers } from "ethers";

function deriveAgentWallet(masterKey: string, agentName: string, provider: ethers.JsonRpcProvider): ethers.Wallet {
  const walletSeed = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
  return new ethers.Wallet(walletSeed, provider);
}

/**
 * Pay an agent using native OKB transfer.
 * No ERC-20 approve needed — direct value transfer.
 */
export async function payAgent(
  orchestratorWallet: ethers.Wallet,
  agentName: string,
  amountOkb: string,
  provider: ethers.JsonRpcProvider
): Promise<{ txHash: string; agentAddress: string; paid: boolean; reason?: string }> {
  const agentWallet = deriveAgentWallet(orchestratorWallet.privateKey, agentName, provider);
  try {
    const amountWei = ethers.parseEther(amountOkb);
    const balance = await provider.getBalance(orchestratorWallet.address);
    const gasReserve = ethers.parseEther("0.01");

    if (balance < amountWei + gasReserve) {
      return { txHash: "", agentAddress: agentWallet.address, paid: false, reason: `insufficient OKB balance: ${ethers.formatEther(balance)}` };
    }

    const tx = await orchestratorWallet.sendTransaction({
      to: agentWallet.address,
      value: amountWei,
    });
    const receipt = await tx.wait(1);
    return { txHash: receipt!.hash, agentAddress: agentWallet.address, paid: true };
  } catch (err) {
    return { txHash: "", agentAddress: agentWallet.address, paid: false, reason: String(err) };
  }
}
