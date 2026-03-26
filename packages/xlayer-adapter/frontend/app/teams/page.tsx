"use client";

import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { useAppSettingsStore } from "@/store/settings";
import { useWeb3 } from "@/components/Web3Provider";
import {
  Users, Zap, Loader2, CheckCircle, ExternalLink, Send, Terminal,
  ArrowRight, RefreshCw
} from "lucide-react";
import { workerApi, type WorkerAgentEntry } from "@/lib/api/worker";

const EXPLORER = "https://www.oklink.com/x-layer-testnet/tx";

interface SwarmAgent {
  name: string;
  address: string;
  fee: string;
  capabilities: string[];
  role: string;
}

interface A2APayment {
  step: string;
  from: string;
  to: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  explorerUrl: string;
}

interface SwarmResult {
  status: string;
  symbol: string;
  currentPrice: number;
  priceSource: string;
  action?: string;
  conditionMet?: boolean;
  totalSpent: string;
  refunded: string;
  payments: A2APayment[];
}

export default function SwarmPage() {
  const { lang } = useLangStore();
  const { workerUrl } = useAppSettingsStore();
  const workerBase = workerUrl.replace(/\/+$/, "");
  const { address, usdc, signer, isSupportedNetwork, chainId } = useWeb3();

  const [agents, setAgents] = useState<SwarmAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState("ETH");
  const [budget, setBudget] = useState("1");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SwarmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load real agents from Worker
  useEffect(() => {
    workerApi.getAgents(workerBase).then((data) => {
      const list: SwarmAgent[] = Object.entries(data).map(([name, info]) => ({
        name,
        address: info.address,
        fee: info.fee || "—",
        capabilities: info.capabilities || [],
        role: name === "orchestrator" ? "Coordinator — hires agents, manages payments"
          : name === "price-oracle" ? "Real-time prices from Binance + CoinGecko"
          : name === "trade-strategy" ? "Risk analysis + trade recommendations"
          : info.capabilities?.join(", ") || "Agent",
      }));
      setAgents(list);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workerBase]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Run real A2A payment flow ───────────────────────────────────────────────
  const runSwarm = async () => {
    if (!address || !signer || !usdc) {
      setError(lang === "en" ? "Connect wallet first" : "请先连接钱包");
      return;
    }
    if (!isSupportedNetwork) {
      setError(lang === "en"
        ? `Switch to X Layer Testnet (current: ${chainId})`
        : `请切换到 X Layer Testnet（当前: ${chainId}）`);
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const token = usdc;
      const budgetWei = (await import("ethers")).ethers.parseUnits(budget, 6);

      // Check balance
      const bal = await token.balanceOf(address);
      if (bal < budgetWei) {
        // Offer to mint
        const mintTx = await token.mint(address, budgetWei * BigInt(2), { gasLimit: 100000 });
        await mintTx.wait(1);
      }

      // Get orchestrator address
      const agentData = await workerApi.getAgents(workerBase);
      const orchAddr = agentData?.orchestrator?.address;
      if (!orchAddr) throw new Error("Cannot fetch orchestrator address");

      // Approve orchestrator (wallet signature!)
      const allowance = await token.allowance(address, orchAddr);
      if (allowance < budgetWei) {
        const approveTx = await token.approve(orchAddr, budgetWei);
        await approveTx.wait(1);
      }

      // Execute A2A
      const res = await workerApi.executeA2A({
        symbol,
        budget,
        callerAddress: address,
        type: "price_alert",
        threshold: 0,
      }, workerBase);

      if (res.status === "completed" && res.payments) {
        setResult(res as SwarmResult);
      } else {
        throw new Error(res.error || "A2A execution failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("user rejected") || msg.includes("User denied")) {
        setError(lang === "en" ? "Transaction cancelled" : "交易已取消");
      } else if (msg.includes("BAD_DATA") || msg.includes("0x")) {
        setError(lang === "en" ? "Wrong network — switch to X Layer Testnet" : "网络错误 — 请切换到 X Layer Testnet");
      } else {
        setError(msg.slice(0, 150));
      }
    } finally {
      setIsRunning(false);
    }
  };

  // ── Chat with the Swarm ─────────────────────────────────────────────────────
  const startChat = async () => {
    try {
      const d = await workerApi.deploySession({ template: "orchestrator" }, workerBase);
      setChatSessionId(d.sessionId);
      setChatMessages([{ role: "system", content: `Swarm session started: ${d.sessionId.slice(0, 8)}…` }]);
    } catch {
      setError("Failed to start chat session");
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !chatSessionId || chatSending) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: msg }]);
    setChatSending(true);
    try {
      const res = await workerApi.chat(chatSessionId, msg, workerBase);
      setChatMessages(prev => [...prev, { role: "assistant", content: res.response }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "system", content: "Error: failed to get response" }]);
    } finally {
      setChatSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-10">

        {/* Header */}
        <div>
          <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Live Network</span>
          <h1 className="text-4xl lg:text-5xl font-light text-white">
            {lang === "en" ? "Agent Swarm" : "智能体蜂群"}
          </h1>
          <p className="text-white/50 mt-2">
            {lang === "en"
              ? "Real agents with on-chain wallets. Orchestrator hires specialists, pays them in axUSDC, and returns results."
              : "真实的链上 Agent。编排器雇佣专业 Agent，用 axUSDC 支付，返回结果。"}
          </p>
        </div>

        {/* Agent Network */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-4">
            {lang === "en" ? "Swarm Agents" : "蜂群成员"} ({agents.length})
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading agents...
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <div key={agent.name} className="border border-[#1de1f1]/20 bg-[#1de1f1]/5 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 flex items-center justify-center" style={{ border: '1px solid #1de1f1' }}>
                      <Terminal className="w-5 h-5" style={{ color: '#1de1f1' }} />
                    </div>
                    <div>
                      <h3 className="text-white font-medium capitalize">{agent.name.replace(/-/g, " ")}</h3>
                      <span className="text-xs" style={{ color: '#1de1f1' }}>{agent.fee}</span>
                    </div>
                    <span className="ml-auto w-2 h-2 rounded-full animate-pulse" style={{ background: '#1de1f1' }} />
                  </div>
                  <p className="text-sm text-white/50 mb-3">{agent.role}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {agent.capabilities.slice(0, 3).map(c => (
                      <span key={c} className="text-[10px] border border-white/10 px-2 py-0.5 text-white/30">{c.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                  <a
                    href={`https://www.oklink.com/x-layer-testnet/address/${agent.address}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs text-white/30 font-mono hover:text-[#1de1f1] transition flex items-center gap-1"
                  >
                    {agent.address.slice(0, 8)}...{agent.address.slice(-6)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* A2A Execution */}
        <div className="border border-[#1de1f1]/20 bg-[#1de1f1]/5 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5" style={{ color: '#1de1f1' }} />
            <div>
              <h2 className="text-lg font-medium text-white">{lang === "en" ? "Run Swarm" : "运行蜂群"}</h2>
              <p className="text-xs text-white/40">
                {lang === "en"
                  ? "Wallet signature → approve axUSDC → Orchestrator hires agents → on-chain payments"
                  : "钱包签名 → 授权 axUSDC → 编排器雇佣 Agent → 链上支付"}
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-end">
            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-widest block mb-1.5">Token</label>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                className="w-24 bg-black/40 border border-white/20 px-3 py-2 text-white text-sm font-mono focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-widest block mb-1.5">Budget (axUSDC)</label>
              <input value={budget} onChange={e => setBudget(e.target.value)}
                className="w-32 bg-black/40 border border-white/20 px-3 py-2 text-white text-sm font-mono focus:outline-none" />
            </div>
            <button onClick={runSwarm} disabled={isRunning || !address}
              className="px-6 py-2 text-sm font-medium flex items-center gap-2 transition disabled:opacity-40"
              style={{ background: '#1de1f1', color: '#000' }}>
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {isRunning
                ? (lang === "en" ? "Running..." : "运行中...")
                : (lang === "en" ? "Execute A2A" : "执行 A2A")}
            </button>
          </div>

          {!address && (
            <p className="text-xs text-white/40">{lang === "en" ? "Connect wallet to run the swarm" : "连接钱包以运行蜂群"}</p>
          )}

          {error && (
            <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 px-4 py-3">{error}</div>
          )}

          {/* Results */}
          {result && (
            <div className="border border-white/10 bg-black/40 p-5 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="w-5 h-5" style={{ color: '#1de1f1' }} />
                <span className="text-white font-medium">{lang === "en" ? "Swarm Complete" : "蜂群执行完成"}</span>
                {result.action && (
                  <span className="ml-auto px-3 py-1 text-xs font-medium"
                    style={{ border: '1px solid #1de1f1', color: '#1de1f1' }}>
                    {result.action}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-white/40 text-xs block mb-1">Price</span>
                  <span className="text-white font-mono">${result.currentPrice?.toLocaleString()}</span>
                  <span className="text-white/30 text-xs ml-1">{result.priceSource}</span>
                </div>
                <div>
                  <span className="text-white/40 text-xs block mb-1">{lang === "en" ? "Spent" : "花费"}</span>
                  <span className="text-white font-mono">{result.totalSpent} axUSDC</span>
                </div>
                <div>
                  <span className="text-white/40 text-xs block mb-1">{lang === "en" ? "Refunded" : "退款"}</span>
                  <span className="font-mono" style={{ color: '#1de1f1' }}>{result.refunded} axUSDC</span>
                </div>
              </div>

              {/* Payment Chain */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <h3 className="text-xs text-white/40 uppercase tracking-[0.2em]">
                  {lang === "en" ? "On-Chain Payment Trail" : "链上支付链路"} ({result.payments.length} txs)
                </h3>
                {result.payments.map((p, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full mt-1.5" style={{ background: '#1de1f1' }} />
                      {i < result.payments.length - 1 && <div className="w-px flex-1 bg-white/10 mt-1" style={{ minHeight: 20 }} />}
                    </div>
                    <div className="flex-1 pb-2">
                      <p className="text-sm text-white">{p.step}</p>
                      <p className="text-xs text-white/50">{p.amount}</p>
                      <a href={p.explorerUrl} target="_blank" rel="noreferrer"
                        className="text-xs font-mono flex items-center gap-1 mt-0.5 hover:underline"
                        style={{ color: '#1de1f1' }}>
                        {p.txHash.slice(0, 14)}...{p.txHash.slice(-8)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chat with Swarm */}
        <div className="border border-white/10 bg-white/5">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-white/40" />
              <h2 className="text-white font-medium">{lang === "en" ? "Chat with Swarm" : "与蜂群对话"}</h2>
              {chatSessionId && <span className="text-xs text-white/30">Session: {chatSessionId.slice(0, 8)}…</span>}
            </div>
            {!chatSessionId && (
              <button onClick={startChat} className="text-xs px-3 py-1.5 flex items-center gap-1 transition"
                style={{ border: '1px solid #1de1f1', color: '#1de1f1' }}>
                <Zap className="w-3 h-3" /> {lang === "en" ? "Start Session" : "开始会话"}
              </button>
            )}
          </div>

          {chatSessionId ? (
            <>
              <div className="h-64 overflow-y-auto p-4 space-y-3 font-mono text-sm">
                {chatMessages.map((m, i) => (
                  <div key={i}>
                    {m.role === "system" && <div className="text-white/30 text-xs">{m.content}</div>}
                    {m.role === "user" && <div><span className="text-white/40">you &gt; </span><span className="text-white">{m.content}</span></div>}
                    {m.role === "assistant" && (
                      <div className="pl-3 border-l-2" style={{ borderColor: '#1de1f1' }}>
                        <span className="text-xs block mb-1" style={{ color: '#1de1f1' }}>swarm</span>
                        <div className="text-white/80 whitespace-pre-wrap">{m.content}</div>
                      </div>
                    )}
                  </div>
                ))}
                {chatSending && <div className="text-white/30 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> thinking...</div>}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-white/10 p-3 flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendChat())}
                  placeholder={lang === "en" ? "Ask the swarm... (try: analyze BTC)" : "问蜂群...（试试: analyze BTC）"}
                  className="flex-1 bg-transparent text-white text-sm font-mono placeholder-white/20 focus:outline-none" />
                <button onClick={sendChat} disabled={chatSending || !chatInput.trim()} className="text-white/40 hover:text-white disabled:opacity-30">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-white/30 text-sm">
              {lang === "en"
                ? "Start a session to chat with the Agent Swarm. Try: \"analyze ETH\" — it will hire agents and pay on-chain."
                : "开始会话以与 Agent Swarm 对话。试试输入 \"analyze ETH\" — 它会雇佣 Agent 并在链上支付。"}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}
