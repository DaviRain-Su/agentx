"use client";

import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWeb3 } from "@/components/Web3Provider";
import { useAppSettingsStore } from "@/store/settings";
import { Terminal, Send, Loader2, Lock, Trash2, Zap, FileCode2, Sparkles } from "lucide-react";
import { workerApi } from "@/lib/api/worker";

interface Agent {
  id: string;
  name: string;
  description: string;
  creator: string;
  price: string; // OKB per call
  isActive: boolean;
  type: 'free' | 'paid';
  address?: string;
  endpoint?: string;
  builtin?: boolean;
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

type ViewMode = 'marketplace' | 'chat';
type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

const AGENT_DESCRIPTIONS: Record<string, string> = {
  "orchestrator": "Official platform coordinator. Manages multi-agent workflows, routes requests, and handles payments.",
  "price-oracle": "Real-time crypto price monitoring from Binance and CoinGecko. Supports 1000+ trading pairs.",
  "trade-strategy": "AI-powered trading strategy analysis. Risk assessment and execution recommendations.",
};

export default function AgentPage() {
  const { address } = useWeb3();
  const { workerUrl: configuredWorkerUrl, agentModel } = useAppSettingsStore();
  const workerUrl = configuredWorkerUrl.replace(/\/+$/, "");

  const [viewMode, setViewMode] = useState<ViewMode>('marketplace');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
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

  // Load real agents from Worker
  useEffect(() => {
    workerApi.getActiveNodes(workerUrl).then((nodes) => {
      const mapped: Agent[] = nodes.map((node) => ({
        id: node.nodeId,
        name: node.name,
        description: AGENT_DESCRIPTIONS[node.name] || node.capabilities?.join(", ") || "Agent",
        creator: node.builtin ? "Built-in" : (node.address?.slice(0, 6) + "..." || "Unknown"),
        price: node.fee || "0",
        isActive: true,
        type: (node.fee && node.fee !== "0") ? "paid" : "free",
        address: node.address,
        endpoint: node.endpoint,
        builtin: node.builtin,
      }));
      setAgents(mapped);
      setAgentsLoading(false);
    }).catch(() => setAgentsLoading(false));
  }, [workerUrl]);

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

  // Start chat with agent
  const startChat = async (agent: Agent) => {
    setSelectedAgent(agent);
    setConnStatus("connecting");
    setChatError(null);

    try {
      // Use agent name as template (built-in agents: orchestrator, price-oracle, trade-strategy)
      const template = agent.name.match(/^[a-z-]+$/) ? agent.name : "orchestrator";
      const deploy = await callWorker<{ sessionId: string }>("/api/deploy", {
        method: "POST",
        body: JSON.stringify({
          template,
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
      <div>
        <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">
          Agent Terminal
        </span>
        <h1 className="text-4xl font-light text-white">Choose Your Agent</h1>
      </div>

      {agentsLoading ? (
        <div className="flex items-center gap-2 text-white/40 text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading agents...
        </div>
      ) : (
        <>
          {/* Free Tier */}
          {agents.filter(a => a.type === 'free').length > 0 && (
            <div>
              <h2 className="text-sm text-white/40 uppercase tracking-[0.2em] mb-4">Free Tier</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {agents.filter(a => a.type === 'free').map(agent => (
                  <div key={agent.id} className="border border-white/10 bg-white/5 p-5 hover:border-white/30 transition">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-white text-lg capitalize">{agent.name.replace(/-/g, " ")}</h3>
                        <span className="text-xs text-[#1de1f1]">{agent.builtin ? "Built-in" : agent.creator}</span>
                      </div>
                      <span className="px-2 py-1 bg-white/10 text-xs text-white/60">FREE</span>
                    </div>
                    <p className="text-sm text-white/50 mb-4 line-clamp-2">{agent.description}</p>
                    {agent.address && (
                      <div className="text-xs text-white/30 font-mono mb-4">
                        {agent.address.slice(0, 8)}...{agent.address.slice(-6)}
                      </div>
                    )}
                    <button
                      onClick={() => startChat(agent)}
                      className="w-full py-2 bg-[#1de1f1] text-black text-sm font-medium hover:bg-[#1de1f1]/80 transition"
                    >
                      Start Chat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pro Agents */}
          {agents.filter(a => a.type === 'paid').length > 0 && (
            <div>
              <h2 className="text-sm text-white/40 uppercase tracking-[0.2em] mb-4">Pro Agents</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {agents.filter(a => a.type === 'paid').map(agent => (
                  <div key={agent.id} className="border border-white/10 bg-white/5 p-5 hover:border-white/30 transition">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-white text-lg capitalize">{agent.name.replace(/-/g, " ")}</h3>
                        <span className="text-xs text-white/40">{agent.builtin ? "Built-in" : agent.creator}</span>
                      </div>
                      <span className="px-2 py-1 bg-white/10 text-xs text-white">{agent.price} OKB/call</span>
                    </div>
                    <p className="text-sm text-white/50 mb-4 line-clamp-2">{agent.description}</p>
                    {agent.address && (
                      <div className="text-xs text-white/30 font-mono mb-4">
                        {agent.address.slice(0, 8)}...{agent.address.slice(-6)}
                      </div>
                    )}
                    <button
                      onClick={() => startChat(agent)}
                      disabled={isPurchasing}
                      className="w-full py-2 bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition flex items-center justify-center gap-2"
                    >
                      {isPurchasing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          Chat ({agent.price} OKB/call)
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agents.length === 0 && (
            <div className="py-8 text-center text-white/30 text-sm">
              No agents available. Check Worker connection.
            </div>
          )}
        </>
      )}
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
              className="px-4 py-2 bg-[#1de1f1] text-black text-sm font-medium hover:bg-[#1de1f1]/80 disabled:opacity-40 transition inline-flex items-center gap-2"
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
      connected: "text-[#1de1f1]",
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
                <div className={`w-2 h-2 rounded-full ${connStatus === "connected" ? "bg-[#1de1f1] animate-pulse" : "bg-yellow-400"}`} />
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
                  <div className="pl-4 border-l-2 border-[#1de1f1]/50">
                    <span className="text-[#1de1f1] text-xs block mb-1">
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
              <div className="pl-4 border-l-2 border-[#1de1f1]/50">
                <span className="text-[#1de1f1] text-xs block mb-1">{selectedAgent.name}</span>
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
        {viewMode === 'chat' && renderChat()}
      </div>
    </DashboardLayout>
  );
}
