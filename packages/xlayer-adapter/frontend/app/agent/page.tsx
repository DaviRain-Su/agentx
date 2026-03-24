"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useWeb3 } from "@/components/Web3Provider";
import { Terminal, Send, Loader2, Lock, Unlock, Trash2, RefreshCw } from "lucide-react";

const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL || "https://gradience-worker.davirain-yin.workers.dev";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

type ConnectionStatus = "disconnected" | "authenticating" | "connecting" | "connected" | "error";

export default function AgentPage() {
  const { address, signer } = useWeb3();

  // Auth state
  const [taskId, setTaskId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [authError, setAuthError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Load taskId from localStorage (set by WorkflowSubmit after task creation)
  useEffect(() => {
    const saved = localStorage.getItem("lastTaskId");
    if (saved) setTaskId(saved);
  }, []);

  // ─── Auth Flow ──────────────────────────────────────────────────────────

  const authenticate = useCallback(async () => {
    if (!signer || !address || !taskId.trim()) return;

    setConnStatus("authenticating");
    setAuthError(null);

    try {
      // Sign the auth message with the wallet
      const message = `Gradience Agent Access: ${taskId.trim()}`;
      const signature = await signer.signMessage(message);

      // Exchange signature for a session token
      const res = await fetch(`${WORKER_URL}/agent/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: taskId.trim(), address, signature }),
      });

      const data = await res.json() as { sessionId?: string; error?: string };

      if (!res.ok || !data.sessionId) {
        throw new Error(data.error || "Authentication failed");
      }

      setSessionId(data.sessionId);
      addSystemMessage(`Authenticated via Task #${taskId.trim()}. Session valid for 24h.`);
      addSystemMessage("Gradience Agent online. How can I help you today?");

      // Connect WebSocket
      connectWebSocket(data.sessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthError(msg);
      setConnStatus("error");
    }
  }, [signer, address, taskId]);

  const connectWebSocket = useCallback((sid: string) => {
    setConnStatus("connecting");

    const wsUrl = WORKER_URL.replace(/^http/, "ws") + `/agent/ws/${sid}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnStatus("connected");
    };

    let streamBuffer = "";
    let streamMsgId = "";

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          content?: string;
          name?: string;
        };

        switch (data.type) {
          case "start":
            setIsThinking(true);
            streamBuffer = "";
            streamMsgId = crypto.randomUUID();
            // Add empty assistant message that will be updated
            setMessages((prev) => [
              ...prev,
              { id: streamMsgId, role: "assistant" as const, content: "", timestamp: new Date() },
            ]);
            break;

          case "delta":
            // Stream text into the existing assistant message
            streamBuffer += data.content || "";
            setMessages((prev) =>
              prev.map((m) => (m.id === streamMsgId ? { ...m, content: streamBuffer } : m))
            );
            break;

          case "tool_start":
            addSystemMessage(`⚙ Calling tool: ${data.name}`);
            break;

          case "tool_end":
            // tool done, continue
            break;

          case "end":
            setIsThinking(false);
            streamBuffer = "";
            streamMsgId = "";
            break;

          case "message":
            // HTTP fallback path
            setIsThinking(false);
            addMessage("assistant", data.content || "");
            break;

          case "error":
            setIsThinking(false);
            addSystemMessage(`Error: ${data.content}`);
            break;

          case "cleared":
            setMessages([]);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnStatus("disconnected");
      wsRef.current = null;
    };

    ws.onerror = () => {
      setConnStatus("error");
      setAuthError("WebSocket connection failed");
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setSessionId(null);
    setConnStatus("disconnected");
    setMessages([]);
    setAuthError(null);
  }, []);

  // ─── Chat ───────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isThinking || connStatus !== "connected") return;

    setInput("");
    addMessage("user", text);
    setIsThinking(true);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", content: text }));
    } else if (sessionId) {
      // HTTP fallback
      try {
        const res = await fetch(`${WORKER_URL}/agent/chat/${sessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const data = await res.json() as { response?: string; error?: string };
        setIsThinking(false);
        if (data.response) addMessage("assistant", data.response);
        else addSystemMessage(data.error || "No response");
      } catch (err) {
        setIsThinking(false);
        addSystemMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [input, isThinking, connStatus, sessionId]);

  const clearHistory = useCallback(async () => {
    if (!sessionId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "clear" }));
    }
    setMessages([]);
  }, [sessionId]);

  // ─── Message Helpers ────────────────────────────────────────────────────

  function addMessage(role: "user" | "assistant", content: string) {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content, timestamp: new Date() },
    ]);
  }

  function addSystemMessage(content: string) {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "system", content, timestamp: new Date() },
    ]);
  }

  // ─── Key handlers ───────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const statusColor = {
    disconnected: "text-white/30",
    authenticating: "text-yellow-400",
    connecting: "text-yellow-400",
    connected: "text-green-400",
    error: "text-red-400",
  }[connStatus];

  const statusLabel = {
    disconnected: "Offline",
    authenticating: "Authenticating...",
    connecting: "Connecting...",
    connected: "Connected",
    error: "Error",
  }[connStatus];

  if (!address) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center space-y-4">
            <Lock className="w-12 h-12 text-white/20 mx-auto" />
            <p className="text-white/50">Connect your wallet to access the Gradience Agent.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">
              AI Agent Runtime
            </span>
            <h1 className="text-4xl font-light text-white">Agent Terminal</h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${connStatus === "connected" ? "bg-green-400 animate-pulse" : connStatus === "error" ? "bg-red-400" : connStatus === "disconnected" ? "bg-white/20" : "bg-yellow-400 animate-pulse"}`} />
            <span className={statusColor}>{statusLabel}</span>
          </div>
        </div>

        {/* Auth panel (shown when not connected) */}
        {connStatus === "disconnected" || connStatus === "error" ? (
          <div className="border border-white/10 bg-white/5 p-6 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-white/40" />
              <span className="text-xs text-white/40 uppercase tracking-[0.2em]">
                Access Control
              </span>
            </div>
            <p className="text-sm text-white/60">
              Access to the Gradience Agent requires an active task on the X Layer network.
              Enter your Task ID and sign to authenticate.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/40 mb-1 block">Task ID</label>
                <input
                  type="text"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  placeholder="e.g. 5"
                  className="w-full bg-white/5 border border-white/20 px-4 py-2 text-white placeholder-white/20 focus:outline-none focus:border-white/40 font-mono"
                />
              </div>

              {authError && (
                <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 px-3 py-2">
                  {authError}
                </p>
              )}

              <button
                onClick={authenticate}
                disabled={!taskId.trim() || connStatus === "authenticating"}
                className="w-full py-3 bg-white text-black font-medium hover:bg-white/90 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {connStatus === "authenticating" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" />
                    Sign & Connect
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}

        {/* Terminal */}
        {(connStatus === "connected" || connStatus === "connecting" || messages.length > 0) && (
          <div className="border border-white/10 bg-[#050505] flex flex-col" style={{ height: "60vh" }}>
            {/* Terminal header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-white/40" />
                <span className="text-xs text-white/40 font-mono">
                  gradience-agent {sessionId ? `[${sessionId.slice(0, 8)}...]` : ""}
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
                <button
                  onClick={disconnect}
                  title="Disconnect"
                  className="p-1 text-white/30 hover:text-red-400 transition"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
              {messages.length === 0 && connStatus === "connecting" && (
                <div className="text-white/30 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Establishing connection...
                </div>
              )}

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
                    <div className="pl-4 border-l-2 border-white/20">
                      <span className="text-green-400 text-xs block mb-1">agent</span>
                      <div className="text-white/80 whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isThinking && (
                <div className="pl-4 border-l-2 border-white/20">
                  <span className="text-green-400 text-xs block mb-1">agent</span>
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
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={connStatus !== "connected" || isThinking}
                placeholder={
                  connStatus !== "connected"
                    ? "Connecting..."
                    : "Ask the agent anything..."
                }
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
        )}

        {/* Info box */}
        <div className="text-xs text-white/30 space-y-1">
          <p>• Each session is isolated and persists for 24 hours.</p>
          <p>• Access requires a valid Gradience task on X Layer. Your wallet must be the task requester.</p>
          <p>• The agent runs on Cloudflare Workers AI (Llama 3.1-8B) with per-session Durable Object storage.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
