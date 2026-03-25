"use client";

import { useState, useRef, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { useAppSettingsStore } from "@/store/settings";
import { Plus, Send, Users, Loader2, Star, DollarSign, MessageSquare } from "lucide-react";

// ─── Demo teams (hardcoded — TeamRegistry contract not deployed) ───────────────

const DEMO_TEAMS = [
  {
    id: "team-defi",
    name: "DeFi Alpha Team",
    description: "Real-time market analysis + trade strategy. Orchestrator coordinates PriceOracle and TradeStrategy agents with A2A payments.",
    agents: ["WorkflowOrchestrator", "PriceOracleAgent", "TradeStrategyAgent"],
    rating: 4.8,
    hires: 142,
    price: "0.008",
    template: "orchestrator",
    systemContext: "You are the DeFi Alpha Team leader. You coordinate multiple agents to analyze DeFi markets. You can fetch real crypto prices and provide trade strategy recommendations. Be concise and data-driven.",
  },
  {
    id: "team-research",
    name: "Research Team",
    description: "Market sentiment + price analysis. Two agents working in parallel to deliver comprehensive market research.",
    agents: ["MarketAnalyst", "SentimentAnalyzer"],
    rating: 4.6,
    hires: 89,
    price: "0.005",
    template: "orchestrator",
    systemContext: "You are a research team specializing in crypto market analysis. Provide detailed market research, sentiment analysis, and data-backed insights. Use clear structure with bullet points.",
  },
  {
    id: "team-yield",
    name: "Yield Farm Team",
    description: "Automated yield optimization with risk management. Monitors pools and rebalances positions according to risk parameters.",
    agents: ["YieldOptimizer", "RiskGuardian"],
    rating: 4.7,
    hires: 63,
    price: "0.010",
    template: "orchestrator",
    systemContext: "You are a yield farming specialist team. You analyze DeFi protocols, calculate APYs, assess risk, and recommend optimal yield strategies. Always include risk warnings.",
  },
];

interface Message {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  timestamp: Date;
}

interface ActiveSession {
  teamId: string;
  sessionId: string;
}

export default function TeamsPage() {
  const { lang } = useLangStore();
  const { workerUrl, agentModel } = useAppSettingsStore();
  const workerBase = workerUrl.replace(/\/+$/, "");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isHiring, setIsHiring] = useState<string | null>(null); // teamId being hired
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeTeam = DEMO_TEAMS.find(t => t.id === activeSession?.teamId) ?? null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleHireTeam = async (team: typeof DEMO_TEAMS[0]) => {
    setIsHiring(team.id);
    try {
      const res = await fetch(`${workerBase}/api/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: team.template, config: { name: team.name, model: agentModel } }),
      });

      if (!res.ok) throw new Error(`Deploy failed: ${res.status}`);
      const data = await res.json() as { sessionId: string };

      setActiveSession({ teamId: team.id, sessionId: data.sessionId });
      setMessages([
        {
          id: "system-1",
          role: "system",
          content: lang === "en"
            ? `${team.name} is now active. Session: ${data.sessionId.slice(0, 8)}…`
            : `${team.name} 已启动。Session: ${data.sessionId.slice(0, 8)}…`,
          timestamp: new Date(),
        },
        {
          id: "agent-welcome",
          role: "agent",
          content: lang === "en"
            ? `Hello! I'm leading the ${team.name}. We have ${team.agents.length} specialized agents ready. How can we help you today?`
            : `你好！我是 ${team.name} 的负责人，我们有 ${team.agents.length} 个专业 Agent 待命。请问有什么需要帮助的？`,
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      console.error("Failed to hire team:", err);
      alert("Failed to start team session. Is the worker deployed?");
    } finally {
      setIsHiring(null);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !activeSession || isSending) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: inputText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setIsSending(true);

    try {
      const res = await fetch(`${workerBase}/agent/chat/${activeSession.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputText }),
      });

      if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
      const data = await res.json() as { response: string };

      setMessages(prev => [...prev, {
        id: `agent-${Date.now()}`,
        role: "agent",
        content: data.response,
        timestamp: new Date(),
      }]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: "system",
        content: lang === "en" ? "Failed to get response. Please try again." : "获取回复失败，请重试。",
        timestamp: new Date(),
      }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-140px)] flex gap-6">
        {/* Team List */}
        <div className="w-80 border border-white/10 bg-white/5 flex flex-col">
          <div className="p-4 border-b border-white/10">
            <h2 className="font-medium text-white">{lang === "en" ? "Teams" : "团队"}</h2>
            <p className="text-xs text-white/40 mt-0.5">{DEMO_TEAMS.length} {lang === "en" ? "teams available" : "个团队可用"}</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {DEMO_TEAMS.map((team) => (
              <div
                key={team.id}
                className={`p-4 border-b border-white/10 transition-all ${
                  activeSession?.teamId === team.id ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-start justify-between mb-1">
                  <span className="font-medium text-white text-sm">{team.name}</span>
                  <div className="flex items-center gap-1 text-yellow-400 text-xs flex-shrink-0 ml-2">
                    <Star className="w-3 h-3 fill-current" />
                    <span>{team.rating}</span>
                  </div>
                </div>

                <p className="text-xs text-white/50 mb-2 line-clamp-2">{team.description}</p>

                <div className="flex items-center justify-between text-xs text-white/40 mb-3">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {team.agents.length} agents
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> {team.price} USDC/call
                  </span>
                  <span>{team.hires} hires</span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {team.agents.map(a => (
                    <span key={a} className="text-[10px] text-white/40 border border-white/10 px-1.5 py-0.5">
                      {a}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleHireTeam(team)}
                  disabled={isHiring === team.id || activeSession?.teamId === team.id}
                  className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs transition disabled:opacity-50"
                >
                  {isHiring === team.id ? (
                    <span className="flex items-center justify-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {lang === "en" ? "Starting…" : "启动中…"}
                    </span>
                  ) : activeSession?.teamId === team.id ? (
                    lang === "en" ? "Active ✓" : "已激活 ✓"
                  ) : (
                    lang === "en" ? "Hire Team" : "雇用团队"
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 border border-white/10 bg-white/5 flex flex-col min-w-0">
          {activeTeam && activeSession ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white">{activeTeam.name}</h3>
                  <p className="text-xs text-white/40 mt-0.5">
                    {activeTeam.agents.join(" · ")} · Session {activeSession.sessionId.slice(0, 8)}…
                  </p>
                </div>
                <button
                  onClick={() => { setActiveSession(null); setMessages([]); }}
                  className="text-xs text-white/40 hover:text-white transition px-2 py-1 border border-white/10 hover:border-white/30"
                >
                  {lang === "en" ? "End Session" : "结束会话"}
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-7 h-7 flex-shrink-0 flex items-center justify-center text-[10px] font-medium ${
                      msg.role === "user"
                        ? "bg-white text-black"
                        : msg.role === "system"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "border border-white/20 text-white/60"
                    }`}>
                      {msg.role === "user" ? "Y" : msg.role === "system" ? "S" : "A"}
                    </div>
                    <div className={`max-w-[75%] px-4 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-white/10 text-white"
                        : msg.role === "system"
                        ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-200"
                        : "border border-white/10 text-white/80"
                    }`}>
                      {msg.role !== "system" && (
                        <div className="text-xs text-white/40 mb-1">
                          {msg.role === "user" ? "You" : activeTeam.name}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 border border-white/20 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 text-white/60 animate-spin" />
                    </div>
                    <div className="border border-white/10 px-4 py-2.5 text-sm text-white/40">
                      {lang === "en" ? "Team is thinking…" : "团队思考中…"}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-white/10">
                <div className="flex gap-2">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={lang === "en" ? "Ask the team anything… (Enter to send)" : "问团队任何问题… (Enter 发送)"}
                    disabled={isSending}
                    rows={2}
                    className="flex-1 bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition disabled:opacity-50 resize-none text-sm"
                  />
                  <button
                    onClick={handleSend}
                    disabled={isSending || !inputText.trim()}
                    className="px-4 bg-white text-black hover:bg-white/90 transition disabled:opacity-50"
                  >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <p className="text-white/40 mb-2">
                  {lang === "en" ? "Select a team to start" : "选择一个团队开始"}
                </p>
                <p className="text-white/30 text-sm">
                  {lang === "en"
                    ? "Each team runs a real AI session on Cloudflare"
                    : "每个团队都运行真实的 AI 会话"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
