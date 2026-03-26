"use client";

import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWeb3 } from "@/components/Web3Provider";
import { useAppSettingsStore } from "@/store/settings";
import { Terminal, Send, Loader2, Lock, Trash2, ShoppingCart, Users, Zap, Star, FileCode2, Sparkles } from "lucide-react";
import { ethers } from "ethers";

// Agent Registry ABI (simplified)
const AGENT_MARKET_ABI = [
  "function getAgent(bytes32 agentId) view returns (tuple(bytes32 id, string name, string description, address creator, uint256 price, bool isActive, uint8 agentType))",
  "function getFreeAgents() view returns (bytes32[])",
  "function getPaidAgents() view returns (bytes32[])",
  "function hasAccess(address user, bytes32 agentId) view returns (bool)",
  "function purchaseAccess(bytes32 agentId) payable",
  "event AgentPurchased(bytes32 indexed agentId, address indexed user, uint256 price)",
];

const MARKET_CONTRACT = process.env.NEXT_PUBLIC_AGENT_MARKET || "0x0000000000000000000000000000000000000000";

interface Agent {
  id: string;
  name: string;
  description: string;
  creator: string;
  price: string; // USDC
  isActive: boolean;
  type: 'free' | 'paid' | 'team';
  rating?: number;
  usage?: number;
}

interface Team {
  id: string;
  name: string;
  members: string[];
  hourlyRate: string;
  description: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  agentName?: string;
}

interface SessionHistoryItem {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
}

interface CodegenResult {
  status: "completed";
  jobId: string;
  summary: string;
  files: string[];
  artifactKey: string;
  artifactBytes: number;
  downloadUrl: string;
  model: string;
  createdAt: number;
  completedAt: number;
}

interface CodegenStatusResponse {
  jobId: string;
  status: "running" | "completed" | "failed" | "unknown";
  result?: CodegenResult;
  error?: string;
}

type ViewMode = 'marketplace' | 'chat' | 'team' | 'codegen';
type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

// Mock data - would come from contract
const MOCK_AGENTS: Agent[] = [
  {
    id: "0x1111",
    name: "AgentX Assistant",
    description: "Official platform assistant. Answers questions about AgentX, helps with workflows, and provides documentation.",
    creator: "0xOfficial",
    price: "0",
    isActive: true,
    type: 'free',
    rating: 4.8,
    usage: 1250,
  },
  {
    id: "0x2222",
    name: "Price Oracle",
    description: "Real-time crypto price monitoring with technical analysis. Supports 1000+ trading pairs.",
    creator: "0xProDev1",
    price: "0.001",
    isActive: true,
    type: 'paid',
    rating: 4.5,
    usage: 342,
  },
  {
    id: "0x3333",
    name: "Trading Strategist",
    description: "AI-powered trading strategy analysis. Backtesting, risk assessment, and execution recommendations.",
    creator: "0xProDev2",
    price: "0.01",
    isActive: true,
    type: 'paid',
    rating: 4.9,
    usage: 89,
  },
  {
    id: "0x4444",
    name: "Code Generator",
    description: "Generate smart contracts, scripts, and dApps. Supports Solidity, TypeScript, Python.",
    creator: "0xCodeMaster",
    price: "0.005",
    isActive: true,
    type: 'paid',
    rating: 4.7,
    usage: 567,
  },
];

const MOCK_TEAMS: Team[] = [
  {
    id: "team1",
    name: "Alpha Trading Squad",
    members: ["Price Oracle", "Trading Strategist", "Risk Manager"],
    hourlyRate: "0.05",
    description: "Complete trading team with price monitoring, strategy analysis, and risk management.",
  },
  {
    id: "team2",
    name: "Dev Automation Crew",
    members: ["Code Generator", "Security Auditor", "Test Writer"],
    hourlyRate: "0.03",
    description: "Development team for smart contract creation, auditing, and testing.",
  },
];

export default function AgentPage() {
  const { address, signer, usdc } = useWeb3();
  const { workerUrl: configuredWorkerUrl, agentModel } = useAppSettingsStore();
  const workerUrl = configuredWorkerUrl.replace(/\/+$/, "");

  const [viewMode, setViewMode] = useState<ViewMode>('marketplace');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Codegen state
  const [codePrompt, setCodePrompt] = useState("");
  const [codeLanguage, setCodeLanguage] = useState<"typescript" | "javascript" | "solidity">("typescript");
  const [codeTarget, setCodeTarget] = useState<"cloudflare-worker" | "smart-contract">("cloudflare-worker");
  const [isGenerating, setIsGenerating] = useState(false);
  const [codegenJobId, setCodegenJobId] = useState<string | null>(null);
  const [codegenStatus, setCodegenStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [codegenError, setCodegenError] = useState<string | null>(null);
  const [codegenResult, setCodegenResult] = useState<CodegenResult | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toWorkerUrl = (path: string) => {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return `${workerUrl}${path.startsWith("/") ? path : `/${path}`}`;
  };

  const callWorker = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!workerUrl) throw new Error("NEXT_PUBLIC_WORKER_URL is not configured");
    const response = await fetch(toWorkerUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const text = await response.text();
    const data = text ? (() => {
      try { return JSON.parse(text); } catch { return { raw: text }; }
    })() : {};

    if (!response.ok) {
      const message = (data as { error?: string }).error || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data as T;
  };

  // Purchase agent access
  const purchaseAccess = async (agent: Agent): Promise<boolean> => {
    if (!signer || !usdc || !address) return false;
    
    setIsPurchasing(true);
    try {
      // Approve USDC
      const price = ethers.parseUnits(agent.price, 6);
      const approveTx = await usdc.approve(MARKET_CONTRACT, price);
      await approveTx.wait();
      
      // Purchase
      const market = new ethers.Contract(MARKET_CONTRACT, AGENT_MARKET_ABI, signer);
      const tx = await market.purchaseAccess(agent.id);
      await tx.wait();
      
      setHasPurchased(true);
      return true;
    } catch (err) {
      console.error("Purchase failed:", err);
      alert("Purchase failed. Please try again.");
      return false;
    } finally {
      setIsPurchasing(false);
    }
  };

  // Start chat with agent
  const startChat = async (agent: Agent) => {
    setSelectedAgent(agent);
    setConnStatus("connecting");
    setChatError(null);

    try {
      const templateMap: Record<string, string> = {
        "0x1111": "orchestrator",
        "0x2222": "price-oracle",
        "0x3333": "trade-strategy",
        "0x4444": "codegen",
      };
      const deploy = await callWorker<{ sessionId: string }>("/api/deploy", {
        method: "POST",
        body: JSON.stringify({
          template: templateMap[agent.id] || "orchestrator",
          config: { name: agent.name, model: agentModel },
        }),
      });

      setSessionId(deploy.sessionId);
      setConnStatus("connected");
      setViewMode("chat");

      const history = await callWorker<{ history: SessionHistoryItem[] }>(`/agent/history/${deploy.sessionId}`);
      const mapped = history.history.map((item, index) => ({
        id: `${item.ts}-${index}`,
        role: item.role,
        content: item.content,
        timestamp: new Date(item.ts),
        agentName: item.role === "assistant" ? agent.name : undefined,
      }));

      if (mapped.length > 0) {
        setMessages(mapped);
      } else {
        setMessages([
          {
            id: "welcome",
            role: "system",
            content: `Connected to ${agent.name} via Worker session ${deploy.sessionId.slice(0, 8)}...`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConnStatus("error");
      setChatError(message);
      setMessages([
        {
          id: "connect-error",
          role: "system",
          content: `Connection failed: ${message}`,
          timestamp: new Date(),
        },
      ]);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || isThinking || !selectedAgent || !sessionId) return;

    const text = input.trim();
    setInput("");
    
    // Add user message
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
    }]);

    setIsThinking(true);
    try {
      const result = await callWorker<{ response: string }>(`/agent/chat/${sessionId}`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.response || "(empty response)",
        timestamp: new Date(),
        agentName: selectedAgent.name,
      }]);
      setConnStatus("connected");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConnStatus("error");
      setChatError(message);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "system",
        content: `Worker error: ${message}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearHistory = async () => {
    if (sessionId) {
      try {
        await callWorker<{ ok?: boolean }>(`/agent/clear/${sessionId}`, { method: "POST", body: JSON.stringify({}) });
      } catch (error) {
        console.error("Failed to clear remote history:", error);
      }
    }
    setMessages([]);
  };

  const backToMarket = () => {
    setViewMode('marketplace');
    setSelectedAgent(null);
    setConnStatus("disconnected");
    setSessionId(null);
    setChatError(null);
    setMessages([]);
  };

  const handlePaidChat = async (agent: Agent) => {
    const missingOnchainPurchaseDeps = !signer || !usdc || MARKET_CONTRACT === "0x0000000000000000000000000000000000000000";
    if (missingOnchainPurchaseDeps) {
      await startChat(agent);
      return;
    }

    if (!hasPurchased) {
      const purchased = await purchaseAccess(agent);
      if (!purchased) return;
    }
    await startChat(agent);
  };

  const runCodegen = async () => {
    if (!codePrompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setCodegenError(null);
    setCodegenResult(null);
    setCodegenStatus("running");

    try {
      const start = await callWorker<{ jobId: string; status: string }>("/api/codegen", {
        method: "POST",
        body: JSON.stringify({
          prompt: codePrompt.trim(),
          language: codeLanguage,
          target: codeTarget,
          model: agentModel,
        }),
      });
      setCodegenJobId(start.jobId);

      for (let attempt = 0; attempt < 90; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const status = await callWorker<CodegenStatusResponse>(`/api/codegen/${start.jobId}`);
        if (status.status === "completed" && status.result) {
          setCodegenResult(status.result);
          setCodegenStatus("completed");
          return;
        }
        if (status.status === "failed") {
          throw new Error(status.error || "Code generation failed");
        }
      }

      throw new Error("Code generation timed out");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCodegenError(message);
      setCodegenStatus("failed");
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Render Helpers ────────────────────────────────────────────────────

  const renderMarketplace = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">
            Agent Swarm
          </span>
          <h1 className="text-4xl font-light text-white">Choose Your Agent</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('marketplace')}
            className={`px-4 py-2 text-sm transition ${viewMode === 'marketplace' ? 'bg-white text-black' : 'border border-white/20 text-white hover:border-white/40'}`}
          >
            <Zap className="w-4 h-4 inline mr-2" />
            Agents
          </button>
          <button
            onClick={() => setViewMode('team')}
            className={`px-4 py-2 text-sm transition ${viewMode === 'team' ? 'bg-white text-black' : 'border border-white/20 text-white hover:border-white/40'}`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Teams
          </button>
          <button
            onClick={() => setViewMode('codegen')}
            className={`px-4 py-2 text-sm transition ${viewMode === 'codegen' ? 'bg-white text-black' : 'border border-white/20 text-white hover:border-white/40'}`}
          >
            <FileCode2 className="w-4 h-4 inline mr-2" />
            Codegen
          </button>
        </div>
      </div>

      {/* Free Tier */}
      <div>
        <h2 className="text-sm text-white/40 uppercase tracking-[0.2em] mb-4">Free Tier</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {MOCK_AGENTS.filter(a => a.type === 'free').map(agent => (
            <div key={agent.id} className="border border-white/10 bg-white/5 p-5 hover:border-white/30 transition">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-white text-lg">{agent.name}</h3>
                  <span className="text-xs text-green-400">Official</span>
                </div>
                <span className="px-2 py-1 bg-white/10 text-xs text-white/60">FREE</span>
              </div>
              <p className="text-sm text-white/50 mb-4 line-clamp-2">{agent.description}</p>
              <div className="flex items-center justify-between text-xs text-white/40 mb-4">
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-400 fill-current" />
                  {agent.rating}
                </span>
                <span>{agent.usage} uses</span>
              </div>
              <button
                onClick={() => startChat(agent)}
                className="w-full py-2 bg-white text-black text-sm font-medium hover:bg-white/90 transition"
              >
                Start Chat
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Paid Tier */}
      <div>
        <h2 className="text-sm text-white/40 uppercase tracking-[0.2em] mb-4">Pro Agents</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {MOCK_AGENTS.filter(a => a.type === 'paid').map(agent => (
            <div key={agent.id} className="border border-white/10 bg-white/5 p-5 hover:border-white/30 transition">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-white text-lg">{agent.name}</h3>
                  <span className="text-xs text-white/40">by {agent.creator.slice(0, 6)}...</span>
                </div>
                <span className="px-2 py-1 bg-white/10 text-xs text-white">{agent.price} USDC/call</span>
              </div>
              <p className="text-sm text-white/50 mb-4 line-clamp-2">{agent.description}</p>
              <div className="flex items-center justify-between text-xs text-white/40 mb-4">
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-400 fill-current" />
                  {agent.rating}
                </span>
                <span>{agent.usage} uses</span>
              </div>
              <button
                onClick={() => handlePaidChat(agent)}
                disabled={isPurchasing}
                className="w-full py-2 bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition flex items-center justify-center gap-2"
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Purchasing...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4" />
                    Purchase & Chat
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTeamView = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">
            Team Collaboration
          </span>
          <h1 className="text-4xl font-light text-white">Hire a Team</h1>
        </div>
        <button
          onClick={() => setViewMode('marketplace')}
          className="px-4 py-2 border border-white/20 text-white text-sm hover:border-white/40 transition"
        >
          Back to Agents
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {MOCK_TEAMS.map(team => (
          <div key={team.id} className="border border-white/10 bg-white/5 p-5 hover:border-white/30 transition">
            <h3 className="font-medium text-white text-lg mb-2">{team.name}</h3>
            <p className="text-sm text-white/50 mb-4">{team.description}</p>
            
            <div className="space-y-2 mb-4">
              {team.members.map((member, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-white/60">
                  <div className="w-6 h-6 border border-white/20 flex items-center justify-center text-xs">
                    {member[0]}
                  </div>
                  {member}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <span className="text-lg font-medium text-white">{team.hourlyRate} USDC/h</span>
              <button
                onClick={() => {
                  setSelectedTeam(team);
                  alert(`Team ${team.name} hired! Starting collaborative session...`);
                }}
                className="px-4 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 transition"
              >
                {selectedTeam?.id === team.id ? "Hired" : "Hire Team"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderCodegenView = () => {
    const downloadUrl = codegenResult ? toWorkerUrl(codegenResult.downloadUrl) : null;
    const statusLabel = {
      idle: "Idle",
      running: "Generating...",
      completed: "Completed",
      failed: "Failed",
    }[codegenStatus];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">
              CodeFlare Workflow
            </span>
            <h1 className="text-4xl font-light text-white">Generate Code with Worker</h1>
          </div>
          <button
            onClick={() => setViewMode("marketplace")}
            className="px-4 py-2 border border-white/20 text-white text-sm hover:border-white/40 transition"
          >
            Back to Agents
          </button>
        </div>

        <div className="border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Target</label>
              <select
                value={codeTarget}
                onChange={(e) => setCodeTarget(e.target.value as "cloudflare-worker" | "smart-contract")}
                className="w-full bg-black/40 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none"
              >
                <option value="cloudflare-worker">Cloudflare Worker</option>
                <option value="smart-contract">Smart Contract</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Language</label>
              <select
                value={codeLanguage}
                onChange={(e) => setCodeLanguage(e.target.value as "typescript" | "javascript" | "solidity")}
                className="w-full bg-black/40 border border-white/20 text-white text-sm px-3 py-2 focus:outline-none"
              >
                <option value="typescript">TypeScript</option>
                <option value="javascript">JavaScript</option>
                <option value="solidity">Solidity</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Requirement Prompt</label>
            <textarea
              value={codePrompt}
              onChange={(e) => setCodePrompt(e.target.value)}
              rows={8}
              placeholder="Describe what you want to build..."
              className="w-full bg-black/40 border border-white/20 text-white text-sm px-3 py-3 focus:outline-none resize-y placeholder:text-white/25"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-white/40">
              Status: <span className="text-white/70">{statusLabel}</span> {codegenJobId ? `• ${codegenJobId}` : ""}
            </div>
            <button
              onClick={runCodegen}
              disabled={isGenerating || !codePrompt.trim()}
              className="px-4 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40 transition inline-flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running Workflow
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>

        {codegenError && (
          <div className="border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">
            {codegenError}
          </div>
        )}

        {codegenResult && (
          <div className="border border-white/10 bg-white/5 p-5 space-y-4">
            <h2 className="text-lg text-white font-medium">Generated Artifact</h2>
            <p className="text-sm text-white/70 whitespace-pre-wrap">{codegenResult.summary}</p>
            <div className="text-xs text-white/40">Model: {codegenResult.model}</div>
            <div className="space-y-2">
              <div className="text-xs text-white/40 uppercase tracking-[0.2em]">Files</div>
              <ul className="grid md:grid-cols-2 gap-2 text-sm font-mono">
                {codegenResult.files.map((file) => (
                  <li key={file} className="border border-white/10 px-3 py-2 text-white/75">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
            {downloadUrl && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 border border-white/20 text-sm text-white hover:border-white/40 transition"
              >
                <FileCode2 className="w-4 h-4" />
                Download Artifact JSON
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderChat = () => {
    if (!selectedAgent) return null;

    const statusColor = {
      disconnected: "text-white/30",
      connecting: "text-yellow-400",
      connected: "text-green-400",
      error: "text-red-400",
    }[connStatus];

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={backToMarket}
              className="text-white/40 hover:text-white transition"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-2xl font-light text-white">{selectedAgent.name}</h1>
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${connStatus === "connected" ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`} />
                <span className={statusColor}>
                  {connStatus === "connected" ? "Online" : connStatus === "error" ? "Error" : "Connecting..."}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            {selectedAgent.type === 'paid' && (
              <span className="text-sm text-white/60">{selectedAgent.price} USDC/call</span>
            )}
          </div>
        </div>

        {/* Terminal */}
        <div className="border border-white/10 bg-[#050505] flex flex-col" style={{ height: "60vh" }}>
          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-white/40" />
              <span className="text-xs text-white/40 font-mono">
                {selectedAgent.name.toLowerCase().replace(/\s+/g, '-')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearHistory}
                title="Clear history"
                className="p-1 text-white/30 hover:text-white/60 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
            {messages.map((msg) => (
              <div key={msg.id} className="space-y-1">
                {msg.role === "system" && (
                  <div className="text-white/30 text-xs border-l-2 border-white/10 pl-2">
                    {msg.content}
                  </div>
                )}
                {msg.role === "user" && (
                  <div>
                    <span className="text-white/40 text-xs">
                      {address?.slice(0, 6)}...{address?.slice(-4)} &gt;{" "}
                    </span>
                    <span className="text-white">{msg.content}</span>
                  </div>
                )}
                {msg.role === "assistant" && (
                  <div className="pl-4 border-l-2 border-green-400/50">
                    <span className="text-green-400 text-xs block mb-1">
                      {msg.agentName || 'agent'}
                    </span>
                    <div className="text-white/80 whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isThinking && (
              <div className="pl-4 border-l-2 border-green-400/50">
                <span className="text-green-400 text-xs block mb-1">{selectedAgent.name}</span>
                <div className="flex items-center gap-1 text-white/40">
                  <span className="animate-pulse">▋</span>
                  <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>▋</span>
                  <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>▋</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-3 flex items-center gap-2 bg-white/3">
            <span className="text-white/40 font-mono text-sm">$</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={connStatus !== "connected" || isThinking}
              placeholder="Type your message..."
              className="flex-1 bg-transparent text-white placeholder-white/20 font-mono text-sm focus:outline-none disabled:opacity-40"
              autoFocus
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || connStatus !== "connected" || isThinking}
              className="p-1 text-white/40 hover:text-white transition disabled:opacity-30"
            >
              {isThinking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {chatError && (
          <div className="text-xs text-red-300 border border-red-400/30 bg-red-400/10 px-3 py-2">
            {chatError}
          </div>
        )}

        {/* Usage info */}
        <div className="flex items-center justify-between text-xs text-white/30">
          <span>
            {selectedAgent.type === 'free' 
              ? "Free tier: 50 messages/day limit" 
              : `Pay-as-you-go: ${selectedAgent.price} USDC per call`}
          </span>
          <span>Session expires in 24h</span>
        </div>
      </div>
    );
  };

  if (!address) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center space-y-4">
            <Lock className="w-12 h-12 text-white/20 mx-auto" />
            <p className="text-white/50">Connect your wallet to access the Agent Swarm.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        {viewMode === 'marketplace' && renderMarketplace()}
        {viewMode === 'team' && renderTeamView()}
        {viewMode === 'codegen' && renderCodegenView()}
        {viewMode === 'chat' && renderChat()}
      </div>
    </DashboardLayout>
  );
}
