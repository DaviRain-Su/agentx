/**
 * XAgent — Base class for all XAgent agents on X Layer.
 *
 * Power Worker SDK: Extend this class, override `execute()`,
 * and your agent automatically handles USDC fee collection,
 * revenue sharing, and ERC-8004 registration.
 *
 * @example
 * class MyDataAgent extends XAgent {
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
  perCall: string;       // USDC amount e.g. "0.001"
  currency: "USDC";
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

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const USDC_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// X Layer Testnet USDC
const USDC_ADDRESS = "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d";

// XAgent platform wallet (receives platform share)
const PLATFORM_ADDRESS = "0x39223444d2f9a4d6769e91aa7908CB22CA3A8686";

// ─── XAgent Base Class ────────────────────────────────────────────────

export abstract class XAgent {
  protected readonly wallet: ethers.Wallet;
  protected readonly usdc: ethers.Contract;
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
    this.usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, this.wallet);
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
   * Collect service fee from caller via USDC transferFrom.
   * Caller must have approved this agent's wallet address first.
   *
   * @param from - Caller's wallet address
   * @param overrideAmount - Override default pricing (optional)
   */
  async collectFee(
    from: string,
    overrideAmount?: string
  ): Promise<FeeCollectionResult> {
    const amount = overrideAmount || this.pricing.perCall;
    const amountWei = ethers.parseUnits(amount, 6);

    // Check allowance
    const allowance = await this.usdc.allowance(from, this.wallet.address);
    if (allowance < amountWei) {
      throw new Error(
        `Insufficient USDC allowance. Need ${amount} USDC approved for ${this.wallet.address}. ` +
        `Current: ${ethers.formatUnits(allowance, 6)} USDC`
      );
    }

    // Transfer fee from caller to agent wallet
    const tx = await this.usdc.transferFrom(from, this.wallet.address, amountWei);
    const receipt = await tx.wait(1);

    return {
      txHash: receipt.hash,
      amount,
      from,
      to: this.wallet.address,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Direct payment from this agent to another agent (A2A).
   * Used by Orchestrator to pay Specialist agents.
   *
   * @param toAgentAddress - Recipient agent wallet address
   * @param amount - USDC amount to pay
   */
  async payAgent(toAgentAddress: string, amount: string): Promise<FeeCollectionResult> {
    const amountWei = ethers.parseUnits(amount, 6);
    const balance = await this.usdc.balanceOf(this.wallet.address);

    if (balance < amountWei) {
      throw new Error(
        `Agent ${this.agentName} has insufficient USDC. ` +
        `Balance: ${ethers.formatUnits(balance, 6)}, needed: ${amount}`
      );
    }

    const tx = await this.usdc.transfer(toAgentAddress, amountWei);
    const receipt = await tx.wait(1);

    return {
      txHash: receipt.hash,
      amount,
      from: this.wallet.address,
      to: toAgentAddress,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Distribute accumulated fees to owner, platform, stakers.
   * Call this to sweep agent earnings.
   *
   * @param ownerAddress - Agent owner's wallet (receives 70%)
   * @param platformAddress - Platform wallet (receives 20%), defaults to XAgent
   */
  async distributeRevenue(
    ownerAddress: string,
    platformAddress: string = PLATFORM_ADDRESS
  ): Promise<{ txHashes: string[]; distributed: Record<string, string> }> {
    const balance = await this.usdc.balanceOf(this.wallet.address);
    if (balance === 0n) return { txHashes: [], distributed: {} };

    const ownerShare  = (balance * BigInt(this.revenueShare.owner))   / 100n;
    const platformShare = (balance * BigInt(this.revenueShare.platform)) / 100n;
    // Stakers share stays in agent wallet for now (future: staking contract)

    const txHashes: string[] = [];
    const distributed: Record<string, string> = {};

    if (ownerShare > 0n) {
      const tx = await this.usdc.transfer(ownerAddress, ownerShare);
      const r = await tx.wait(1);
      txHashes.push(r.hash);
      distributed.owner = ethers.formatUnits(ownerShare, 6);
    }

    if (platformShare > 0n) {
      const tx = await this.usdc.transfer(platformAddress, platformShare);
      const r = await tx.wait(1);
      txHashes.push(r.hash);
      distributed.platform = ethers.formatUnits(platformShare, 6);
    }

    return { txHashes, distributed };
  }

  /** USDC balance of this agent's wallet */
  async getBalance(): Promise<string> {
    const bal = await this.usdc.balanceOf(this.wallet.address);
    return ethers.formatUnits(bal, 6);
  }

  /**
   * Transfer the agent's full USDC balance to a recipient (e.g. refund to caller).
   * Returns null if balance is zero.
   */
  async refundAll(toAddress: string): Promise<FeeCollectionResult | null> {
    const balance: bigint = await this.usdc.balanceOf(this.wallet.address);
    if (balance === 0n) return null;
    const tx = await this.usdc.transfer(toAddress, balance);
    const receipt = await tx.wait(1);
    return {
      txHash: receipt.hash,
      amount: ethers.formatUnits(balance, 6),
      from: this.wallet.address,
      to: toAddress,
      blockNumber: receipt.blockNumber,
    };
  }
}
