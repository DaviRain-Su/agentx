/**
 * AgentX — Base class for all AgentX agents on X Layer.
 *
 * All inter-agent payments use **native OKB** (X Layer's gas token).
 * No ERC-20 approve/allowance needed — just direct value transfers.
 *
 * @example
 * class MyDataAgent extends AgentX {
 *   constructor(masterKey: string, provider: Provider) {
 *     super(masterKey, "my-data-agent", { perCall: "0.001" }, provider);
 *   }
 *   async execute(from: string, params: any) {
 *     const { txHash } = await this.collectFee(from);
 *     const data = await fetchMyData(params);
 *     return { data, txHash };
 *   }
 * }
 */

import { ethers } from "ethers";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentPricing {
  perCall: string;       // OKB amount e.g. "0.001"
  currency: "OKB";
}

export interface FeeCollectionResult {
  txHash: string;
  amount: string;
  from: string;
  to: string;
  blockNumber: number;
}

export interface RevenueShareConfig {
  owner: number;      // % to agent owner  (default 70)
  platform: number;   // % to platform     (default 20)
  stakers: number;    // % to stakers      (default 10)
}

export interface AgentInfo {
  name: string;
  address: string;
  pricing: AgentPricing;
  capabilities: string[];
  registryId?: number;     // ERC-8004 registration ID (if registered)
}

// AgentX platform wallet (receives platform share)
const PLATFORM_ADDRESS = "0x39223444d2f9a4d6769e91aa7908CB22CA3A8686";

// Gas reserve: keep enough OKB in wallet to pay for future txs
const GAS_RESERVE = ethers.parseEther("0.01");

// ─── AgentX Base Class ────────────────────────────────────────────────

export abstract class AgentX {
  protected readonly wallet: ethers.Wallet;
  protected readonly provider: ethers.JsonRpcProvider;
  protected readonly agentName: string;
  protected readonly pricing: AgentPricing;

  private readonly revenueShare: RevenueShareConfig;

  constructor(
    masterKey: string,
    agentName: string,
    pricing: AgentPricing,
    provider: ethers.JsonRpcProvider,
    revenueShare: RevenueShareConfig = { owner: 70, platform: 20, stakers: 10 }
  ) {
    this.agentName = agentName;
    this.pricing = pricing;
    this.provider = provider;
    this.revenueShare = revenueShare;

    // Derive deterministic agent wallet from master key + agent name
    const walletSeed = ethers.keccak256(ethers.toUtf8Bytes(`${masterKey}:${agentName}`));
    this.wallet = new ethers.Wallet(walletSeed, provider);
  }

  /** Agent's derived wallet address */
  getAddress(): string {
    return this.wallet.address;
  }

  /** Agent info for marketplace display */
  getInfo(): AgentInfo {
    return {
      name: this.agentName,
      address: this.wallet.address,
      pricing: this.pricing,
      capabilities: this.getCapabilities(),
    };
  }

  /** Override to declare agent capabilities */
  protected getCapabilities(): string[] {
    return [];
  }

  /**
   * Collect service fee — verify caller sent OKB to this agent.
   *
   * With native tokens there's no "pull" (transferFrom). The caller must
   * send OKB to this agent's address beforehand. This method verifies the
   * agent has enough balance to have received the expected fee.
   *
   * For the A2A workflow the Orchestrator calls payAgent() to push OKB
   * to sub-agents, so collectFee is mainly used for the User → Orchestrator step.
   *
   * @param from - Caller's wallet address (for record-keeping)
   * @param overrideAmount - Override default pricing (optional)
   */
  async collectFee(
    from: string,
    overrideAmount?: string
  ): Promise<FeeCollectionResult> {
    const amount = overrideAmount || this.pricing.perCall;
    const balance = await this.provider.getBalance(this.wallet.address);
    const needed = ethers.parseEther(amount);

    if (balance < needed) {
      throw new Error(
        `Insufficient OKB balance for ${this.agentName}. ` +
        `Need ${amount} OKB, have ${ethers.formatEther(balance)} OKB`
      );
    }

    // Return a "virtual" receipt — the actual transfer was a native send by the caller.
    // In the A2A workflow, the real tx comes from payAgent().
    return {
      txHash: "0x" + "0".repeat(64), // placeholder — real tx tracked by caller
      amount,
      from,
      to: this.wallet.address,
      blockNumber: 0,
    };
  }

  /**
   * Direct payment from this agent to another agent (A2A).
   * Used by Orchestrator to pay specialist agents.
   * Native OKB transfer — no approve needed.
   *
   * @param toAgentAddress - Recipient agent wallet address
   * @param amount - OKB amount to pay (e.g. "0.001")
   */
  async payAgent(toAgentAddress: string, amount: string): Promise<FeeCollectionResult> {
    const amountWei = ethers.parseEther(amount);
    const balance = await this.provider.getBalance(this.wallet.address);

    if (balance < amountWei + GAS_RESERVE) {
      throw new Error(
        `Agent ${this.agentName} has insufficient OKB. ` +
        `Balance: ${ethers.formatEther(balance)}, needed: ${amount} + gas reserve`
      );
    }

    const tx = await this.wallet.sendTransaction({
      to: toAgentAddress,
      value: amountWei,
    });
    const receipt = await tx.wait(1);

    return {
      txHash: receipt!.hash,
      amount,
      from: this.wallet.address,
      to: toAgentAddress,
      blockNumber: receipt!.blockNumber,
    };
  }

  /**
   * Distribute accumulated fees to owner, platform, stakers.
   * Call this to sweep agent earnings.
   *
   * @param ownerAddress - Agent owner's wallet (receives 70%)
   * @param platformAddress - Platform wallet (receives 20%), defaults to AgentX
   */
  async distributeRevenue(
    ownerAddress: string,
    platformAddress: string = PLATFORM_ADDRESS
  ): Promise<{ txHashes: string[]; distributed: Record<string, string> }> {
    const balance = await this.provider.getBalance(this.wallet.address);
    const distributable = balance - GAS_RESERVE;
    if (distributable <= 0n) return { txHashes: [], distributed: {} };

    const ownerShare = (distributable * BigInt(this.revenueShare.owner)) / 100n;
    const platformShare = (distributable * BigInt(this.revenueShare.platform)) / 100n;

    const txHashes: string[] = [];
    const distributed: Record<string, string> = {};

    if (ownerShare > 0n) {
      const tx = await this.wallet.sendTransaction({ to: ownerAddress, value: ownerShare });
      const r = await tx.wait(1);
      txHashes.push(r!.hash);
      distributed.owner = ethers.formatEther(ownerShare);
    }

    if (platformShare > 0n) {
      const tx = await this.wallet.sendTransaction({ to: platformAddress, value: platformShare });
      const r = await tx.wait(1);
      txHashes.push(r!.hash);
      distributed.platform = ethers.formatEther(platformShare);
    }

    return { txHashes, distributed };
  }

  /** Native OKB balance of this agent's wallet */
  async getBalance(): Promise<string> {
    const bal = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(bal);
  }

  /**
   * Transfer the agent's OKB balance (minus gas reserve) to a recipient.
   * Used for refunding unspent budget to the caller.
   * Returns null if nothing to refund.
   */
  async refundAll(toAddress: string): Promise<FeeCollectionResult | null> {
    const balance = await this.provider.getBalance(this.wallet.address);
    const refundable = balance - GAS_RESERVE;
    if (refundable <= 0n) return null;

    const tx = await this.wallet.sendTransaction({
      to: toAddress,
      value: refundable,
    });
    const receipt = await tx.wait(1);

    return {
      txHash: receipt!.hash,
      amount: ethers.formatEther(refundable),
      from: this.wallet.address,
      to: toAddress,
      blockNumber: receipt!.blockNumber,
    };
  }
}
