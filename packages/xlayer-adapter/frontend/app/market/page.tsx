"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWeb3 } from "@/components/Web3Provider";
import { useLangStore } from "@/store/lang";
import { Search, Plus, X, Loader2, CheckCircle, ExternalLink, RefreshCw, Wallet, Zap, Users, ChevronRight } from "lucide-react";
import { ethers } from "ethers";
import { workerApi, ActiveNode } from "@/lib/api/worker";

const XLAYER_RPC = "https://xlayertestrpc.okx.com";
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "https://agentx-worker.davirain-yin.workers.dev";

// ── Agent metadata ────────────────────────────────────────────────────────────

const AGENT_META: Record<string, { subtitle: string; description: string; category: string }> = {
  orchestrator: {
    subtitle: "A2A Coordinator",
    description: "Orchestrates multi-agent workflows. Hires PriceOracle and TradeStrategy sub-agents via A2A payment protocol, collects 20% commission.",
    category: "Network",
  },
  "price-oracle": {
    subtitle: "Real-time Price Oracle",
    description: "Fetches live crypto prices from Binance/CoinGecko. Callable by other agents via A2A payment on X Layer.",
    category: "Oracle",
  },
  "trade-strategy": {
    subtitle: "MEV-Protected DEX Execution",
    description: "Evaluates market conditions and prepares DEX swap calldata. Settles fees atomically after each task.",
    category: "Trading",
  },
};

const CAP_TO_CATEGORY: Record<string, string> = {
  price_oracle: "Oracle",
  trade_execution: "Trading",
  sentiment_analysis: "AI",
  risk_management: "Security",
  yield_optimization: "DeFi",
  a2a_payment: "Network",
  data_analysis: "Analytics",
  workflow_orchestration: "AI",
};

function capToCategory(caps: string[]): string {
  for (const cap of caps) if (CAP_TO_CATEGORY[cap]) return CAP_TO_CATEGORY[cap];
  return "AI";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarketAgent {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  fee: string;
  feeRaw: number;
  feeToken: string;
  category: string;
  address?: string;
  source: "builtin" | "node" | "registry";
  capabilities: string[];
  endpoint?: string;
}

// ── Data hook ─────────────────────────────────────────────────────────────────

function useMarketAgents() {
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const results: MarketAgent[] = [];

    // 1. Live nodes from /api/nodes/active (includes built-ins + external)
    try {
      const nodes = await workerApi.getActiveNodes();
      for (const node of nodes) {
        const meta = AGENT_META[node.name];
        const fee = node.fee ? parseFloat(node.fee) : 0;
        results.push({
          id: `node_${node.nodeId}`,
          name: node.name,
          subtitle: meta?.subtitle ?? node.capabilities.join(", "),
          description: meta?.description ?? `Live agent with capabilities: ${node.capabilities.join(", ")}`,
          fee: node.fee ? `${node.fee} ${node.feeToken ?? "OKB"}` : "—",
          feeRaw: fee,
          feeToken: node.feeToken ?? "OKB",
          category: meta?.category ?? capToCategory(node.capabilities),
          address: node.address,
          source: node.builtin ? "builtin" : "node",
          capabilities: node.capabilities,
          endpoint: node.endpoint,
        });
      }
    } catch { /* Worker offline */ }

    // 2. On-chain AgentRegistry (user-published agents)
    try {
      const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
      const iface = new ethers.Interface([
        "event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)",
      ]);
      const topic = iface.getEvent("AgentRegistered")!.topicHash;
      const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
      const logs = await provider.getLogs({ address: REGISTRY, topics: [topic], fromBlock: 0, toBlock: "latest" });
      for (const log of logs) {
        try {
          const parsed = iface.parseLog(log);
          if (!parsed) continue;
          const name = parsed.args.name as string;
          const owner = parsed.args.owner as string;
          const agentId = parsed.args.agentId?.toString();
          if (results.some(a => a.name.toLowerCase() === name.toLowerCase())) continue;
          results.push({
            id: `registry_${agentId}`,
            name,
            subtitle: `On-chain · ID #${agentId}`,
            description: `Published by ${owner.slice(0, 6)}...${owner.slice(-4)} via AgentRegistry ERC-8004`,
            fee: "—", feeRaw: 0, feeToken: "OKB",
            category: "AI",
            source: "registry",
            capabilities: [],
            address: owner,
          });
        } catch { /* skip */ }
      }
    } catch { /* RPC error */ }

    setAgents(results);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { agents, loading, reload: load };
}

// ── Team hook (localStorage-persisted per wallet) ─────────────────────────────

const TEAM_SIZE = 3;

function useTeam(address: string | null) {
  const storageKey = address ? `agentx_team_${address.toLowerCase()}` : null;

  const [team, setTeam] = useState<string[]>(() => {
    if (typeof window === "undefined" || !storageKey) return [];
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    if (!storageKey) { setTeam([]); return; }
    try { setTeam(JSON.parse(localStorage.getItem(storageKey) || "[]")); } catch { setTeam([]); }
  }, [storageKey]);

  const hire = useCallback((agentName: string) => {
    setTeam(prev => {
      if (prev.includes(agentName)) return prev;
      const next = [...prev, agentName];
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const disband = useCallback(() => {
    setTeam([]);
    if (storageKey) localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { team, hire, disband, full: team.length >= TEAM_SIZE };
}

// ── Hire Modal (X402 flow) ────────────────────────────────────────────────────

type HireStep = "payment_required" | "paying" | "confirming" | "done" | "error";

interface HireModalProps {
  agent: MarketAgent;
  onDone: (agentName: string) => void;
  onClose: () => void;
}

function HireModal({ agent, onDone, onClose }: HireModalProps) {
  const { provider } = useWeb3();
  const [step, setStep] = useState<HireStep>("payment_required");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");

  const pay = async () => {
    if (!provider || !agent.address) {
      setError("Connect your wallet first.");
      return;
    }
    setStep("paying");
    setError("");
    try {
      const signer = await provider.getSigner();
      const amountWei = ethers.parseEther(agent.feeRaw.toString());
      const tx = await signer.sendTransaction({ to: agent.address, value: amountWei });
      setStep("confirming");
      setTxHash(tx.hash);
      await tx.wait(1);

      // Confirm hire with proof
      const result = await workerApi.hireAgent(agent.name, tx.hash);
      if (result.status === 200 && result.hired) {
        setStep("done");
        setTimeout(() => { onDone(agent.name); onClose(); }, 1500);
      } else {
        setError("Hire confirmation failed. Try again.");
        setStep("error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("user rejected") ? "Transaction cancelled." : msg.slice(0, 120));
      setStep("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0a0a0a] border border-white/20 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] mb-1">X402 Payment Required</p>
            <h2 className="text-xl font-light text-white">Hire {agent.name}</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {step === "done" ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle className="w-10 h-10 text-[#1de1f1]" />
              <p className="text-white text-lg font-light">Agent Hired!</p>
              <p className="text-white/40 text-sm text-center">{agent.name} has joined your team</p>
            </div>
          ) : (
            <>
              {/* Payment info */}
              <div className="bg-white/5 border border-white/10 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Agent</span>
                  <span className="text-white font-mono">{agent.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Amount</span>
                  <span className="text-white font-medium">{agent.fee}</span>
                </div>
                {agent.address && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Recipient</span>
                    <span className="text-white/60 font-mono text-xs">
                      {agent.address.slice(0, 10)}...{agent.address.slice(-6)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Network</span>
                  <span className="text-white/60">X Layer Testnet</span>
                </div>
              </div>

              <div className="bg-white/3 border border-white/5 px-4 py-3">
                <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">How X402 works</p>
                <p className="text-xs text-white/40 leading-relaxed">
                  The agent returned HTTP 402. Your wallet pays the fee on-chain, then you retry
                  with the tx hash as proof. Access is granted atomically after confirmation.
                </p>
              </div>

              {txHash && step === "confirming" && (
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Waiting for confirmation...</span>
                  <a
                    href={`https://www.oklink.com/x-layer-testnet/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#1de1f1] flex items-center gap-1 hover:underline ml-auto"
                  >
                    {txHash.slice(0, 8)}... <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2">{error}</p>
              )}

              <button
                onClick={step === "error" ? pay : pay}
                disabled={step === "paying" || step === "confirming"}
                className="w-full py-3 bg-white text-black font-medium hover:bg-white/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {step === "paying" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Confirm in wallet...</>
                ) : step === "confirming" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Confirming tx...</>
                ) : (
                  <>Pay {agent.fee} &rarr; Hire</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Deploy Team Panel ─────────────────────────────────────────────────────────

interface DeployPanelProps {
  team: string[];
  agents: MarketAgent[];
  address: string;
  onDisband: () => void;
}

type DeployState = "idle" | "running" | "done" | "error";

function DeployPanel({ team, agents, address, onDisband }: DeployPanelProps) {
  const [symbol, setSymbol] = useState("ETH");
  const [budget, setBudget] = useState("0.02");
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");

  const teamAgents = team.map(name => agents.find(a => a.name === name)).filter(Boolean) as MarketAgent[];

  const runTeam = async () => {
    setDeployState("running");
    setError("");
    setResult(null);
    try {
      const res = await workerApi.simulateA2A({
        symbol,
        budget: parseFloat(budget),
        type: "price-check",
      });
      setResult(res as unknown as Record<string, unknown>);
      setDeployState("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Workflow failed");
      setDeployState("error");
    }
  };

  return (
    <div className="border border-[#1de1f1]/30 bg-[#1de1f1]/5 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[#1de1f1]/60 uppercase tracking-[0.2em] mb-1">Team Ready</p>
          <h3 className="text-lg font-light text-white">3/3 Agents Hired — Deploy Team</h3>
        </div>
        <button onClick={onDisband} className="text-xs text-white/30 hover:text-white/60 transition uppercase tracking-wider">
          Disband
        </button>
      </div>

      {/* Team member addresses */}
      <div className="grid grid-cols-3 gap-3">
        {teamAgents.map(agent => (
          <div key={agent.name} className="border border-white/10 p-3 bg-white/5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 bg-[#1de1f1] rounded-full animate-pulse" />
              <span className="text-xs font-medium text-white capitalize">{agent.name.replace(/-/g, " ")}</span>
            </div>
            {agent.address && (
              <p className="text-[10px] text-white/30 font-mono">{agent.address.slice(0, 6)}...{agent.address.slice(-4)}</p>
            )}
            <p className="text-[10px] text-white/20 mt-0.5">{agent.fee}</p>
          </div>
        ))}
      </div>

      {/* Workflow config */}
      {deployState !== "done" && (
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-[10px] text-white/40 uppercase tracking-widest block mb-1.5">Symbol</label>
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              className="w-full bg-white/5 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 transition font-mono"
              placeholder="ETH"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-white/40 uppercase tracking-widest block mb-1.5">Budget (OKB)</label>
            <input
              value={budget}
              onChange={e => setBudget(e.target.value)}
              className="w-full bg-white/5 border border-white/10 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 transition font-mono"
              placeholder="0.02"
            />
          </div>
          <button
            onClick={runTeam}
            disabled={deployState === "running"}
            className="px-6 py-2 border border-[#1de1f1]/60 text-[#1de1f1] text-sm hover:bg-[#1de1f1]/10 transition flex items-center gap-2 disabled:opacity-50"
            style={{ color: '#1de1f1', borderColor: 'rgba(29,225,241,0.4)' }}
          >
            {deployState === "running" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Run A2A
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2">{error}</p>}

      {/* A2A result */}
      {deployState === "done" && result && (
        <div className="border border-white/10 bg-black/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[#1de1f1]" />
            <span className="text-sm text-white">A2A Workflow Complete</span>
            <span className="ml-auto text-xs px-2 py-0.5 border border-white/10 text-white/50">
              {String(result.action)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span className="text-white/30">Symbol</span>
            <span className="text-white font-mono">{String(result.symbol)}</span>
            <span className="text-white/30">Price</span>
            <span className="text-white font-mono">${Number(result.currentPrice).toLocaleString()}</span>
          </div>
          {Array.isArray(result.simulatedPayments) && result.simulatedPayments.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-white/5">
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">A2A Payments</p>
              {(result.simulatedPayments as Array<{ step: string; amount: string }>).map((p, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-white/40">{p.step}</span>
                  <span className="text-white font-mono">{p.amount}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => { setDeployState("idle"); setResult(null); }}
            className="text-xs text-white/30 hover:text-white/60 transition"
          >
            Run again
          </button>
        </div>
      )}
    </div>
  );
}

// ── Publish Modal ─────────────────────────────────────────────────────────────

const AGENT_REGISTRY_ADDRESS = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const AGENT_REGISTRY_ABI = [
  "function registerAgent(string name, string metadataURI, bytes32[] capabilities) returns (uint256)",
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)",
];
const CAPABILITY_OPTIONS = [
  "price_oracle", "trade_execution", "sentiment_analysis", "risk_management",
  "yield_optimization", "a2a_payment", "data_analysis", "workflow_orchestration",
];

type PublishState = "idle" | "submitting" | "success" | "error";

function PublishModal({ onClose }: { onClose: () => void }) {
  const { provider } = useWeb3();
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [state, setState] = useState<PublishState>("idle");
  const [result, setResult] = useState<{ agentId: number; txHash: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const toggleCap = (cap: string) => setSelectedCaps(prev =>
    prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
  );

  const handlePublish = async () => {
    if (!name.trim() || selectedCaps.length === 0) {
      setErrorMsg("Agent name and at least one capability are required."); return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim())) {
      setErrorMsg("Name must start with a letter/underscore; letters, digits, underscores only."); return;
    }
    if (!provider) { setErrorMsg("Connect your wallet first."); return; }
    setState("submitting"); setErrorMsg("");
    try {
      const signer = await provider.getSigner();
      const registry = new ethers.Contract(AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI, signer);
      const metadataURI = endpoint.trim()
        ? `${endpoint.trim().replace(/\/$/, "")}/metadata.json`
        : `https://agentx.network/agents/${encodeURIComponent(name.trim())}`;
      const capHashes = selectedCaps.map(c => ethers.keccak256(ethers.toUtf8Bytes(c)));
      const tx = await registry.registerAgent(name.trim(), metadataURI, capHashes);
      const receipt = await tx.wait(1);
      let agentId = 0;
      const iface = new ethers.Interface(AGENT_REGISTRY_ABI);
      for (const log of receipt.logs) {
        try { const p = iface.parseLog(log); if (p?.name === "AgentRegistered") agentId = Number(p.args.agentId); } catch { /* skip */ }
      }
      setResult({ agentId, txHash: receipt.hash });
      setState("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg.includes("user rejected") ? "Transaction cancelled." : msg.slice(0, 120));
      setState("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0a0a0a] border border-white/20 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-light text-white">Publish Agent</h2>
            <p className="text-xs text-white/40 mt-1">AgentRegistry ERC-8004 · X Layer Testnet</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>
        {state === "success" && result ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-white" />
              <h3 className="text-lg font-light text-white">Agent Published</h3>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-white/40">Agent ID</span><span className="text-white font-mono">#{result.agentId}</span></div>
              <div className="flex justify-between items-center">
                <span className="text-white/40">Tx Hash</span>
                <a href={`https://www.oklink.com/x-layer-testnet/tx/${result.txHash}`} target="_blank" rel="noreferrer"
                  className="text-white font-mono text-xs flex items-center gap-1 hover:underline">
                  {result.txHash.slice(0, 10)}...<ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            <button onClick={onClose} className="w-full py-3 bg-white text-black font-medium hover:bg-white/90 transition">Done</button>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-2">Agent Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. my_quant_agent"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition text-sm" />
              <p className="text-xs text-white/30 mt-1">Letters, digits, underscores only</p>
            </div>
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-2">Service Endpoint</label>
              <input type="text" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://your-agent.workers.dev"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-2">Capabilities *</label>
              <div className="flex flex-wrap gap-2">
                {CAPABILITY_OPTIONS.map(cap => (
                  <button key={cap} onClick={() => toggleCap(cap)}
                    className={`px-3 py-1.5 text-xs uppercase tracking-wider border transition ${
                      selectedCaps.includes(cap) ? "bg-white text-black border-white" : "bg-transparent text-white/50 border-white/20 hover:border-white/40"
                    }`}>
                    {cap.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            {errorMsg && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2">{errorMsg}</p>}
            <button onClick={handlePublish} disabled={state === "submitting"}
              className="w-full py-3 bg-white text-black font-medium hover:bg-white/90 transition flex items-center justify-center gap-2 disabled:opacity-50">
              {state === "submitting" ? <><Loader2 className="w-4 h-4 animate-spin" />Registering...</> : <><Plus className="w-4 h-4" />Publish to Network</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["All", "Network", "Oracle", "Trading", "DeFi", "AI", "Security", "Analytics"];

export default function MarketPage() {
  const { lang } = useLangStore();
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPublish, setShowPublish] = useState(false);
  const [hiringAgent, setHiringAgent] = useState<MarketAgent | null>(null);
  const { agents, loading, reload } = useMarketAgents();
  const { address, provider, openWalletModal, isConnecting } = useWeb3();
  const { team, hire, disband, full } = useTeam(address);

  const handleHireClick = (agent: MarketAgent) => {
    if (!address) { openWalletModal(); return; }
    if (team.includes(agent.name)) return;
    setHiringAgent(agent);
  };

  const filteredAgents = agents.filter(agent => {
    const matchesCategory = activeCategory === "All" || agent.category === activeCategory;
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <DashboardLayout>
      {showPublish && <PublishModal onClose={() => { setShowPublish(false); reload(); }} />}
      {hiringAgent && (
        <HireModal
          agent={hiringAgent}
          onDone={(name) => hire(name)}
          onClose={() => setHiringAgent(null)}
        />
      )}

      <div className="max-w-7xl mx-auto space-y-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Live Network</span>
            <h1 className="text-4xl lg:text-5xl font-light text-white">
              {lang === "en" ? "Agent Marketplace" : "智能体市场"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={reload} disabled={loading}
              className="p-2 border border-white/20 text-white/40 hover:text-white hover:border-white/40 transition" title="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            {address ? (
              <button onClick={() => setShowPublish(true)}
                className="px-5 py-2.5 border border-white/20 text-white/60 font-medium hover:bg-white/5 transition flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" />
                {lang === "en" ? "Publish Agent" : "发布 Agent"}
              </button>
            ) : (
              <button onClick={openWalletModal} disabled={isConnecting}
                className="px-5 py-2.5 border border-white/30 text-white font-medium hover:bg-white/10 transition flex items-center gap-2 text-sm disabled:opacity-50">
                <Wallet className="w-4 h-4" />
                {isConnecting ? (lang === "en" ? "Connecting..." : "连接中...") : (lang === "en" ? "Connect Wallet" : "连接钱包")}
              </button>
            )}
          </div>
        </div>

        {/* My Team Panel */}
        {full && address ? (
          <DeployPanel team={team} agents={agents} address={address} onDisband={disband} />
        ) : (
          <div className="border border-white/10 p-6">
            <div className="flex items-center gap-3 mb-5">
              <Users className="w-4 h-4 text-white/40" />
              <span className="text-xs text-white/40 uppercase tracking-[0.2em]">My Team</span>
              <span className="ml-auto text-xs text-white/30">{team.length}/{TEAM_SIZE} agents hired</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: TEAM_SIZE }).map((_, i) => {
                const agentName = team[i];
                const agent = agentName ? agents.find(a => a.name === agentName) : undefined;
                return (
                  <div key={i} className={`border p-4 min-h-[80px] flex flex-col justify-center transition ${
                    agent ? "border-white/20 bg-white/5" : "border-dashed border-white/10"
                  }`}>
                    {agent ? (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#1de1f1' }} />
                          <span className="text-sm font-medium text-white capitalize">{agent.name.replace(/-/g, " ")}</span>
                        </div>
                        <p className="text-xs text-white/30">{agent.fee}</p>
                        {agent.address && <p className="text-[10px] text-white/20 font-mono mt-1">{agent.address.slice(0, 6)}...{agent.address.slice(-4)}</p>}
                      </>
                    ) : (
                      <p className="text-xs text-white/20 text-center">Slot {i + 1} — empty</p>
                    )}
                  </div>
                );
              })}
            </div>
            {team.length > 0 && !full && (
              <p className="text-xs text-white/30 mt-4 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                Hire {TEAM_SIZE - team.length} more agent{TEAM_SIZE - team.length > 1 ? "s" : ""} below to unlock team deployment
              </p>
            )}
            {!address && (
              <p className="text-xs text-white/20 mt-4">Connect wallet to hire agents and form a team</p>
            )}
          </div>
        )}

        {/* Search + Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder={lang === "en" ? "Search agents..." : "搜索 Agent..."}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 px-12 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`px-4 py-3 text-sm uppercase tracking-wider whitespace-nowrap transition-all border ${
                  activeCategory === cat ? "bg-white text-black border-white" : "bg-transparent text-white/60 border-white/20 hover:border-white/40"
                }`}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        {!loading && (
          <p className="text-xs text-white/30">
            {agents.length} {lang === "en" ? "agents on network" : "个 Agent 已上网"}
            {" · "}
            {agents.filter(a => a.source === "builtin" || a.source === "node").length} {lang === "en" ? "live" : "在线"}
            {" · "}
            {agents.filter(a => a.source === "registry").length} {lang === "en" ? "registered" : "已注册"}
          </p>
        )}

        {/* Loading */}
        {loading && agents.length === 0 && (
          <div className="flex items-center gap-3 text-white/40 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {lang === "en" ? "Fetching agents from network..." : "正在从网络获取 Agent..."}
          </div>
        )}

        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgents.map(agent => {
            const isHired = team.includes(agent.name);
            const isBuiltin = agent.source === "builtin";
            return (
              <div key={agent.id} className={`p-6 border transition-all group ${
                isHired ? "border-[#1de1f1]/30 bg-[#1de1f1]/5" : "border-white/10 hover:border-white/30 bg-white/5"
              }`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border border-white/20 flex items-center justify-center bg-white/5">
                      <span className="text-xl">🤖</span>
                    </div>
                    <div>
                      <h4 className="font-medium text-white capitalize">{agent.name.replace(/-/g, " ")}</h4>
                      <span className="text-[10px] text-white/40 uppercase tracking-widest">{agent.category}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isHired ? (
                      <span className="text-[10px] px-2 py-0.5 border border-[#1de1f1]/40 text-[#1de1f1]/80 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-[#1de1f1] inline-block" />
                        HIRED
                      </span>
                    ) : (
                      <span className={`text-[10px] px-2 py-0.5 border ${
                        isBuiltin ? "border-white/30 text-white/60" : "border-white/10 text-white/30"
                      }`}>
                        {isBuiltin ? "LIVE" : agent.source === "node" ? "NODE" : "ON-CHAIN"}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-white/50 mb-1">{agent.subtitle}</p>
                <p className="text-sm text-white/40 mb-4 line-clamp-2">{agent.description}</p>

                {agent.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {agent.capabilities.slice(0, 3).map(cap => (
                      <span key={cap} className="text-[10px] border border-white/10 px-2 py-0.5 text-white/30">
                        {cap.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-white/10">
                  <div>
                    <span className="text-white/40 text-xs">Fee: </span>
                    <span className="text-white text-sm">{agent.fee}</span>
                    {agent.address && (
                      <p className="text-[10px] text-white/30 font-mono mt-0.5">
                        {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                      </p>
                    )}
                  </div>
                  {isHired ? (
                    <span className="text-xs text-[#1de1f1]/60 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> In team
                    </span>
                  ) : (
                    <button
                      onClick={() => handleHireClick(agent)}
                      disabled={full}
                      className="text-sm text-white/60 hover:text-white flex items-center gap-1 transition disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Zap className="w-3 h-3" />
                      {address ? (lang === "en" ? "Hire" : "雇佣") : (lang === "en" ? "Connect" : "连接")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Publish CTA */}
          <button
            onClick={address ? () => setShowPublish(true) : openWalletModal}
            className="p-6 border border-dashed border-white/10 hover:border-white/30 transition-all bg-transparent group flex flex-col items-center justify-center gap-3 min-h-[200px]"
          >
            <div className="w-12 h-12 border border-dashed border-white/10 group-hover:border-white/30 flex items-center justify-center transition">
              <Plus className="w-6 h-6 text-white/20 group-hover:text-white/50 transition" />
            </div>
            <div className="text-center">
              <p className="text-white/30 group-hover:text-white/50 transition text-sm font-medium">
                {lang === "en" ? "Publish Your Agent" : "发布你的 Agent"}
              </p>
              <p className="text-white/15 text-xs mt-1">
                {lang === "en" ? "Register on X Layer · Earn OKB per call" : "注册到 X Layer · 每次调用赚取 OKB"}
              </p>
            </div>
          </button>
        </div>

        {/* Empty state */}
        {!loading && agents.length === 0 && (
          <div className="border border-white/10 p-12 text-center bg-white/5">
            <p className="text-white/40">
              {lang === "en" ? "No agents found. Worker may be offline." : "未找到 Agent，Worker 可能离线。"}
            </p>
            <button onClick={reload} className="mt-4 text-sm text-white/60 hover:text-white transition">
              {lang === "en" ? "Retry" : "重试"}
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
