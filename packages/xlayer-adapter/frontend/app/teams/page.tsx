"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";
import { Plus, Send, Users, Loader2 } from "lucide-react";

interface Message {
  id: string;
  sender: string;
  type: "agent" | "user";
  content: string;
  time: string;
}

const MOCK_TEAMS = [
  {
    id: "1",
    name: "Alpha Trading Squad",
    members: ["Price Oracle", "Trade Exec", "Risk Manager"],
    lastMessage: "ETH target reached. Execute buy?",
    unread: 3,
  },
  {
    id: "2",
    name: "Research Pod",
    members: ["Sentiment AI", "Data Scraper"],
    lastMessage: "Social sentiment shifting positive on L2s",
    unread: 0,
  },
];

const MOCK_MESSAGES: Message[] = [
  { id: "1", sender: "Price Oracle", type: "agent", content: "ETH/USDT: $1,847.32 (+2.3%)", time: "14:32" },
  { id: "2", sender: "Risk Manager", type: "agent", content: "Volatility: ELEVATED. Position size: 15% max.", time: "14:33" },
  { id: "3", sender: "You", type: "user", content: "What's the funding rate?", time: "14:35" },
  { id: "4", sender: "Price Oracle", type: "agent", content: "Binance: +0.015% | dYdX: +0.008% | Aave: -0.003%", time: "14:35" },
];

export default function TeamsPage() {
  const { lang } = useLangStore();
  const [activeTeam, setActiveTeam] = useState(MOCK_TEAMS[0]);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "You",
      type: "user",
      content: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    
    setMessages(prev => [...prev, userMsg]);
    setMessage("");
    setIsSending(true);

    // Mock agent response delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Add agent response
    const agentResponses = [
      "Processing your request...",
      "Analyzing market conditions...",
      "Checking agent availability...",
      "Optimizing execution path...",
    ];
    
    const agentMsg: Message = {
      id: (Date.now() + 1).toString(),
      sender: activeTeam.members[0],
      type: "agent",
      content: agentResponses[Math.floor(Math.random() * agentResponses.length)],
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    
    setMessages(prev => [...prev, agentMsg]);
    setIsSending(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-140px)] flex gap-6">
        {/* Team List */}
        <div className="w-80 border border-white/10 bg-white/5 flex flex-col">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-medium text-white">{t("navTeams", lang)}</h2>
            <button className="p-2 hover:bg-white/5 transition text-white/60 hover:text-white">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {MOCK_TEAMS.map((team) => (
              <button
                key={team.id}
                onClick={() => setActiveTeam(team)}
                className={`w-full p-4 text-left transition-all border-l-2 ${
                  activeTeam.id === team.id
                    ? "bg-white/10 border-white"
                    : "hover:bg-white/5 border-transparent"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-white">{team.name}</span>
                  {team.unread > 0 && (
                    <span className="w-5 h-5 bg-white text-black text-xs flex items-center justify-center font-bold">
                      {team.unread}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/50 truncate">{team.lastMessage}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 border border-white/10 bg-white/5 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-white">{activeTeam.name}</h3>
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Users className="w-4 h-4" />
                {activeTeam.members.length} agents
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.type === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-8 h-8 flex items-center justify-center text-xs font-medium ${
                    msg.type === "user"
                      ? "bg-white text-black"
                      : "border border-white/20 text-white/60"
                  }`}
                >
                  {msg.type === "user" ? "Y" : "A"}
                </div>
                <div
                  className={`max-w-md px-4 py-2 ${
                    msg.type === "user"
                      ? "bg-white/10 text-white"
                      : "border border-white/10 text-white/80"
                  }`}
                >
                  <div className="text-xs text-white/50 mb-1">{msg.sender}</div>
                  <div className="text-sm">{msg.content}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type a message..."
                disabled={isSending}
                className="flex-1 bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition disabled:opacity-50"
              />
              <button 
                onClick={handleSendMessage}
                disabled={isSending || !message.trim()}
                className="px-4 py-3 bg-white text-black hover:bg-white/90 transition disabled:opacity-50"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
