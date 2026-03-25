/**
 * AgentRegistryService — ERC-8004 on-chain agent registration.
 *
 * Registers agents to the X Layer AgentRegistry contract,
 * giving each agent a verifiable on-chain identity (agentId).
 *
 * Contract: 0x8004A818BFB912233c491871b3d84c89A494BD9e (X Layer Testnet)
 */

import { ethers } from "ethers";
import { GradienceAgent } from "../core/GradienceAgent";

const AGENT_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

const AGENT_REGISTRY_ABI = [
  "function registerAgent(string name, string metadataURI, bytes32[] capabilities) returns (uint256)",
  "function getAgent(uint256 agentId) view returns (address owner, string name, bool active, uint256 reputation)",
  "function getAgentByAddress(address agentAddress) view returns (uint256 agentId, string name, bool active)",
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)",
];

export interface RegisteredAgent {
  agentId: number;
  name: string;
  address: string;
  capabilities: string[];
  metadataURI: string;
  txHash: string;
  explorerUrl: string;
}

export class AgentRegistryService {
  private readonly registry: ethers.Contract;
  private readonly provider: ethers.JsonRpcProvider;

  constructor(provider: ethers.JsonRpcProvider) {
    this.provider = provider;
    this.registry = new ethers.Contract(AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI, provider);
  }

  /**
   * Register an agent on-chain via ERC-8004.
   * The agent's wallet signs the registration transaction.
   *
   * @param agent - The GradienceAgent instance to register
   * @param signer - Wallet that signs the registration (usually the agent's wallet)
   * @param metadataURI - URL to agent metadata JSON (capabilities, description, pricing)
   */
  async registerAgent(
    agent: GradienceAgent,
    signer: ethers.Wallet,
    metadataURI?: string
  ): Promise<RegisteredAgent> {
    const info = agent.getInfo();
    const uri = metadataURI || `https://gradience-worker.davirain-yin.workers.dev/agents/${info.name}`;

    const capabilityHashes = info.capabilities.map((c) =>
      ethers.keccak256(ethers.toUtf8Bytes(c))
    );

    const registryWithSigner = this.registry.connect(signer) as ethers.Contract;
    const tx = await registryWithSigner.registerAgent(
      info.name,
      uri,
      capabilityHashes
    );

    const receipt = await tx.wait(1);

    // Extract agentId from AgentRegistered event
    let agentId = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = this.registry.interface.parseLog(log);
        if (parsed?.name === "AgentRegistered") {
          agentId = Number(parsed.args.agentId);
          break;
        }
      } catch { /* skip */ }
    }

    return {
      agentId,
      name: info.name,
      address: info.address,
      capabilities: info.capabilities,
      metadataURI: uri,
      txHash: receipt.hash,
      explorerUrl: `https://www.oklink.com/x-layer-testnet/tx/${receipt.hash}`,
    };
  }

  /**
   * Look up a registered agent by its on-chain ID.
   */
  async getAgent(agentId: number): Promise<{
    owner: string;
    name: string;
    active: boolean;
    reputation: number;
  }> {
    const result = await this.registry.getAgent(agentId);
    return {
      owner: result.owner,
      name: result.name,
      active: result.active,
      reputation: Number(result.reputation),
    };
  }

  /**
   * Check if a wallet address is already registered.
   */
  async getAgentByAddress(address: string): Promise<{
    agentId: number;
    name: string;
    active: boolean;
  } | null> {
    try {
      const result = await this.registry.getAgentByAddress(address);
      if (Number(result.agentId) === 0) return null;
      return {
        agentId: Number(result.agentId),
        name: result.name,
        active: result.active,
      };
    } catch {
      return null;
    }
  }

  /**
   * Register all 3 demo agents at once.
   * Returns registration records for all agents.
   */
  async registerDemoAgents(
    agents: { agent: GradienceAgent; signer: ethers.Wallet }[]
  ): Promise<RegisteredAgent[]> {
    const results: RegisteredAgent[] = [];
    for (const { agent, signer } of agents) {
      try {
        const registered = await this.registerAgent(agent, signer);
        results.push(registered);
        console.log(`[Registry] Registered ${registered.name} → ID ${registered.agentId}`);
      } catch (err) {
        console.error(`[Registry] Failed to register ${agent.getInfo().name}:`, err);
      }
    }
    return results;
  }
}
