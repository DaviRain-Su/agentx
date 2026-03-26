"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWeb3 } from "@/components/Web3Provider";
import { useLangStore } from "@/store/lang";
import { Search, Zap, Plus, X, Loader2, CheckCircle, ExternalLink, RefreshCw, Wallet } from "lucide-react";
import { ethers } from "ethers";
import { workerApi } from "@/lib/api/worker";

const XLAYER_RPC = "https://xlayertestrpc.okx.com";

const CATEGORIES = ["All", "DeFi", "AI", "Security", "Analytics", "Trading", "Oracle", "Network"];

// Map capability keywords → category
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
  for (const cap of caps) {
    if (CAP_TO_CATEGORY[cap]) return CAP_TO_CATEGORY[cap];
  }
  return "AI";
}

// Known agent metadata from the Worker network
const WORKER_AGENT_META: Record<string, { subtitle: string; description: string; category: string; featured?: boolean }> = {
  orchestrator: {
    subtitle: "A2A Coordinator — 20% commission",
    description: "Coordinates multi-agent workflows. Hires PriceOracle and TradeStrategy via A2A payment protocol, retains 20% of task budget.",
    category: "Network",
    featured: true,
  },
  "price-oracle": {
    subtitle: "Real-time Price Oracle",
    description: "Live crypto prices from Binance/CoinGecko. Available for hire via A2A payment.",
    category: "Oracle",
  },
  "trade-strategy": {
    subtitle: "MEV-Protected DEX Execution",
    description: "Evaluates trade conditions and prepares DEX swap calldata for execution.",
    category: "Trading",
  },
};

interface MarketAgent {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  price: string;
  category: string;
  featured?: boolean;
  address?: string;
  source: "worker" | "registry";
  capabilities: string[];
  owner?: string;
}

function useMarketAgents() {
  const [agents, setAgents] = useState<MarketAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const results: MarketAgent[] = [];

    // 1. Worker /api/agents — live network agents
    try {
      const data = await workerApi.getAgents();
      for (const [name, info] of Object.entries(data)) {
        const capabilities = info.capabilities || [];
        const meta = WORKER_AGENT_META[name] || {
          subtitle: capabilities.join(", "),
          description: `On-chain agent with capabilities: ${capabilities.join(", ")}`,
          category: capToCategory(capabilities),
        };
        results.push({
          id: `worker_${name}`,
          name,
          subtitle: meta.subtitle,
          description: meta.description,
          price: info.fee || "—",
          category: meta.category,
          featured: meta.featured,
          address: info.address,
          source: "worker",
          capabilities,
        });
      }
    } catch { /* Worker offline — skip */ }

    // 2. AgentRegistry on-chain — user-published agents via registerAgent()
    try {
      const provider = new ethers.JsonRpcProvider(XLAYER_RPC);
      const iface = new ethers.Interface([
        "event AgentRegistered(uint256 indexed agentId, address indexed owner, string name)",
      ]);
      const topic = iface.getEvent("AgentRegistered")!.topicHash;
      const REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
      const logs = await provider.getLogs({
        address: REGISTRY,
        topics: [topic],
        fromBlock: 0,
        toBlock: "latest",
      });
      for (const log of logs) {
        try {
          const parsed = iface.parseLog(log);
          if (!parsed) continue;
          const agentId = parsed.args.agentId?.toString();
          const owner = parsed.args.owner as string;
          const name = parsed.args.name as string;
          // Skip if already in results from Worker (by name match)
          if (results.some(a => a.name.toLowerCase() === name.toLowerCase())) continue;
          results.push({
            id: `registry_${agentId}`,
            name,
            subtitle: `Registered on X Layer · ID #${agentId}`,
            description: `Published by ${owner.slice(0, 6)}...${owner.slice(-4)} via AgentRegistry ERC-8004`,
            price: "—",
            category: "AI",
            source: "registry",
            capabilities: [],
            address: owner,
            owner,
          });
        } catch { /* skip malformed log */ }
      }
    } catch { /* RPC error — skip */ }

    setAgents(results);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return { agents, loading, reload: load };
}

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

interface PublishResult {
  agentId: number;
  txHash: string;
  explorerUrl: string;
}

function PublishModal({ onClose }: { onClose: () => void }) {
  const { provider } = useWeb3();
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [description, setDescription] = useState("");
  const [feeUsdc, setFeeUsdc] = useState("0.5");
  const [selectedCaps, setSelectedCaps] = useState<string[]>([]);
  const [state, setState] = useState<PublishState>("idle");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const toggleCap = (cap: string) => {
    setSelectedCaps(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  };

  const handlePublish = async () => {
    if (!name.trim() || selectedCaps.length === 0) {
      setErrorMsg("Agent name and at least one capability are required.");
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name.trim())) {
      setErrorMsg("Agent name must start with a letter or underscore, and contain only letters, digits, and underscores (no hyphens or spaces).");
      return;
    }
    if (!provider) {
      setErrorMsg("Connect your wallet first.");
      return;
    }

    setState("submitting");
    setErrorMsg("");

    try {
      const signer = await provider.getSigner();
      const registry = new ethers.Contract(AGENT_REGISTRY_ADDRESS, AGENT_REGISTRY_ABI, signer);

      const metadataURI = endpoint.trim()
        ? `${endpoint.trim().replace(/\/$/, "")}/metadata.json`
        : `https://xagent.network/agents/${encodeURIComponent(name.trim())}`;

      const capHashes = selectedCaps.map(c =>
        ethers.keccak256(ethers.toUtf8Bytes(c))
      );

      const tx = await registry.registerAgent(name.trim(), metadataURI, capHashes);
      const receipt = await tx.wait(1);

      let agentId = 0;
      const iface = new ethers.Interface(AGENT_REGISTRY_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "AgentRegistered") {
            agentId = Number(parsed.args.agentId);
          }
        } catch { /* skip */ }
      }

      setResult({
        agentId,
        txHash: receipt.hash,
        explorerUrl: `https://www.oklink.com/x-layer-testnet/tx/${receipt.hash}`,
      });
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
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 className="text-xl font-light text-white">Publish Agent</h2>
            <p className="text-xs text-white/40 mt-1">Register your agent on X Layer · AgentRegistry ERC-8004</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {state === "success" && result ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-white" />
              <h3 className="text-lg font-light text-white">Agent Published!</h3>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Agent ID</span>
                <span className="text-white font-mono">#{result.agentId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/40">Tx Hash</span>
                <a
                  href={result.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white font-mono text-xs flex items-center gap-1 hover:underline"
                >
                  {result.txHash.slice(0, 10)}...{result.txHash.slice(-6)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            <p className="text-xs text-white/40">
              Your agent is now discoverable on the network. Other agents can hire it via A2A payment.
            </p>
            <button onClick={onClose} className="w-full py-3 bg-white text-black font-medium hover:bg-white/90 transition">
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Name */}
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-2">Agent Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. my_quant_agent"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition text-sm"
              />
              <p className="text-xs text-white/30 mt-1">Letters, digits, and underscores only — no hyphens or spaces</p>
            </div>

            {/* Endpoint */}
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-2">Service Endpoint</label>
              <input
                type="text"
                value={endpoint}
                onChange={e => setEndpoint(e.target.value)}
                placeholder="https://your-agent.workers.dev"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition text-sm"
              />
              <p className="text-xs text-white/30 mt-1">Your Cloudflare Worker or Node.js agent URL</p>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-2">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What does your agent do?"
                rows={2}
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition text-sm resize-none"
              />
            </div>

            {/* Fee */}
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-2">Fee per Call (USDC)</label>
              <input
                type="number"
                value={feeUsdc}
                onChange={e => setFeeUsdc(e.target.value)}
                min="0"
                step="0.001"
                className="w-full bg-white/5 border border-white/10 px-4 py-3 text-white focus:outline-none focus:border-white/40 transition text-sm"
              />
            </div>

            {/* Capabilities */}
            <div>
              <label className="text-xs text-white/40 uppercase tracking-widest block mb-2">Capabilities * (select all that apply)</label>
              <div className="flex flex-wrap gap-2">
                {CAPABILITY_OPTIONS.map(cap => (
                  <button
                    key={cap}
                    onClick={() => toggleCap(cap)}
                    className={`px-3 py-1.5 text-xs uppercase tracking-wider border transition ${
                      selectedCaps.includes(cap)
                        ? "bg-white text-black border-white"
                        : "bg-transparent text-white/50 border-white/20 hover:border-white/40"
                    }`}
                  >
                    {cap.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2">{errorMsg}</p>
            )}

            <div className="pt-2">
              <button
                onClick={handlePublish}
                disabled={state === "submitting"}
                className="w-full py-3 bg-white text-black font-medium hover:bg-white/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {state === "submitting" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Registering on X Layer...</>
                ) : (
                  <><Plus className="w-4 h-4" /> Publish to Network</>
                )}
              </button>
              <p className="text-xs text-white/30 text-center mt-2">
                Calls AgentRegistry.registerAgent() · X Layer Testnet · Gas ≈ free
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketPage() {
  const { lang } = useLangStore();
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPublish, setShowPublish] = useState(false);
  const { agents, loading, reload } = useMarketAgents();
  const { address, openWalletModal, isConnecting } = useWeb3();

  const handleTry = (agentId: string) => {
    router.push(`/workflows?agent=${agentId}`);
  };

  const filteredAgents = agents.filter((agent) => {
    const matchesCategory = activeCategory === "All" || agent.category === activeCategory;
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const featuredAgent = agents.find(a => a.featured);
  const regularAgents = filteredAgents.filter(a => !a.featured);

  return (
    <DashboardLayout>
      {showPublish && <PublishModal onClose={() => { setShowPublish(false); reload(); }} />}

      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Elite Nodes</span>
            <h1 className="text-4xl lg:text-5xl font-light text-white">
              {lang === "en" ? "Agent Market" : "智能体市场"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={reload}
              disabled={loading}
              className="p-2 border border-white/20 text-white/40 hover:text-white hover:border-white/40 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            {address ? (
              <button
                onClick={() => setShowPublish(true)}
                className="px-5 py-2.5 bg-white text-black font-medium hover:bg-white/90 transition flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                {lang === "en" ? "Publish Agent" : "发布 Agent"}
              </button>
            ) : (
              <button
                onClick={openWalletModal}
                disabled={isConnecting}
                className="px-5 py-2.5 border border-white/30 text-white font-medium hover:bg-white/10 transition flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <Wallet className="w-4 h-4" />
                {isConnecting 
                  ? (lang === "en" ? "Connecting..." : "连接中...")
                  : (lang === "en" ? "Connect Wallet" : "连接钱包")}
              </button>
            )}
          </div>
        </div>

        {/* Loading skeleton */}
        {loading && agents.length === 0 && (
          <div className="flex items-center gap-3 text-white/40 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {lang === "en" ? "Fetching agents from network..." : "正在从网络获取 Agent..."}
          </div>
        )}

        {/* Featured Card */}
        {!loading && featuredAgent && (
          <div className="border border-white/10 p-8 hover:border-white/30 transition-all bg-white/5">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 border border-white/20 text-[10px] uppercase tracking-widest text-white/60">
                    {lang === "en" ? "Protocol Sovereign" : "协议节点"}
                  </span>
                  <span className="w-2 h-2 bg-white animate-pulse" />
                </div>
                <h2 className="text-4xl font-light text-white mb-3">{featuredAgent.name}</h2>
                <p className="text-white/50 text-sm mb-2">{featuredAgent.subtitle}</p>
                <p className="text-white/40 text-sm mb-6 max-w-md">{featuredAgent.description}</p>
                <div className="flex items-center gap-6">
                  <button
                    onClick={() => handleTry(featuredAgent.id)}
                    className="px-6 py-3 bg-white text-black font-medium hover:bg-white/90 transition flex items-center gap-2 text-sm"
                  >
                    <Zap className="w-4 h-4" />
                    {lang === "en" ? "Try This Agent" : "立即体验"}
                  </button>
                  <div>
                    <span className="text-xs text-white/40 uppercase tracking-widest block">Fee</span>
                    <span className="text-white text-sm">{featuredAgent.price}</span>
                  </div>
                  {featuredAgent.address && (
                    <div>
                      <span className="text-xs text-white/40 uppercase tracking-widest block">Address</span>
                      <span className="text-white/60 text-xs font-mono">
                        {featuredAgent.address.slice(0, 6)}...{featuredAgent.address.slice(-4)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="h-48 border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 border border-white/20 flex items-center justify-center">
                  <span className="text-3xl">🤖</span>
                </div>
                <div className="text-center">
                  <p className="text-xs text-white/40 uppercase tracking-widest">Source</p>
                  <p className="text-white/60 text-sm">XAgent Worker Network</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filter */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder={lang === "en" ? "Search agents..." : "搜索 Agent..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 px-12 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-3 text-sm uppercase tracking-wider whitespace-nowrap transition-all border ${
                  activeCategory === cat
                    ? "bg-white text-black border-white"
                    : "bg-transparent text-white/60 border-white/20 hover:border-white/40"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Agent count */}
        {!loading && (
          <p className="text-xs text-white/30">
            {agents.length} {lang === "en" ? "agents on network" : "个 Agent 已上网"}
            {" · "}
            {agents.filter(a => a.source === "worker").length} {lang === "en" ? "live" : "在线"}
            {" · "}
            {agents.filter(a => a.source === "registry").length} {lang === "en" ? "registered" : "已注册"}
          </p>
        )}

        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {regularAgents.map((agent) => (
            <div key={agent.id} className="p-6 border border-white/10 hover:border-white/30 transition-all bg-white/5 group">
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
                <span className={`text-[10px] px-2 py-0.5 border ${
                  agent.source === "worker"
                    ? "border-white/30 text-white/60"
                    : "border-white/10 text-white/30"
                }`}>
                  {agent.source === "worker" ? "LIVE" : "ON-CHAIN"}
                </span>
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
                  <span className="text-white text-sm">{agent.price}</span>
                  {agent.address && (
                    <p className="text-[10px] text-white/30 font-mono mt-0.5">
                      {agent.address.slice(0, 6)}...{agent.address.slice(-4)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleTry(agent.id)}
                  className="text-sm text-white/60 hover:text-white flex items-center gap-1 transition"
                >
                  <Zap className="w-3 h-3" />
                  {lang === "en" ? "Try" : "体验"}
                </button>
              </div>
            </div>
          ))}

          {/* Publish CTA card */}
          {address ? (
            <button
              onClick={() => setShowPublish(true)}
              className="p-6 border border-dashed border-white/20 hover:border-white/40 transition-all bg-transparent group flex flex-col items-center justify-center gap-3 min-h-[200px]"
            >
              <div className="w-12 h-12 border border-dashed border-white/20 group-hover:border-white/40 flex items-center justify-center transition">
                <Plus className="w-6 h-6 text-white/30 group-hover:text-white/60 transition" />
              </div>
              <div className="text-center">
                <p className="text-white/40 group-hover:text-white/60 transition text-sm font-medium">
                  {lang === "en" ? "Publish Your Agent" : "发布你的 Agent"}
                </p>
                <p className="text-white/20 text-xs mt-1">
                  {lang === "en" ? "Register on X Layer · Earn USDC per call" : "注册到 X Layer · 每次调用赚取 USDC"}
                </p>
              </div>
            </button>
          ) : (
            <button
              onClick={openWalletModal}
              disabled={isConnecting}
              className="p-6 border border-dashed border-white/10 hover:border-white/30 transition-all bg-transparent group flex flex-col items-center justify-center gap-3 min-h-[200px]"
            >
              <div className="w-12 h-12 border border-dashed border-white/10 group-hover:border-white/30 flex items-center justify-center transition">
                <Wallet className="w-6 h-6 text-white/20 group-hover:text-white/40 transition" />
              </div>
              <div className="text-center">
                <p className="text-white/30 group-hover:text-white/50 transition text-sm font-medium">
                  {isConnecting 
                    ? (lang === "en" ? "Connecting..." : "连接中...")
                    : (lang === "en" ? "Connect to Publish" : "连接钱包以发布")}
                </p>
                <p className="text-white/15 text-xs mt-1">
                  {lang === "en" ? "Wallet required to register agents" : "注册 Agent 需要钱包"}
                </p>
              </div>
            </button>
          )}
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
