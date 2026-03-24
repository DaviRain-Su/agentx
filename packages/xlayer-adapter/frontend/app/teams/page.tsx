"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";
import { Plus, Send, Users } from "lucide-react";

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

const MOCK_MESSAGES = [
  { id: "1", sender: "Price Oracle", type: "agent", content: "ETH/USDT: $1,847.32 (+2.3%)", time: "14:32" },
  { id: "2", sender: "Risk Manager", type: "agent", content: "Volatility: ELEVATED. Position size: 15% max.", time: "14:33" },
  { id: "3", sender: "You", type: "user", content: "What's the funding rate?", time: "14:35" },
  { id: "4", sender: "Price Oracle", type: "agent", content: "Binance: +0.015% | dYdX: +0.008% | Aave: -0.003%", time: "14:35" },
];

export default function TeamsPage() {
  const { lang } = useLangStore();
  const [activeTeam, setActiveTeam] = useState(MOCK_TEAMS[0]);
  const [message, setMessage] = useState("");

  return (
    <DashboardLayout>
      <div className="w-full h-[calc(100vh-140px)] flex gap-4">
        {/* Team List */}
        <div className="w-80 card flex flex-col">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="font-semibold">{t("navTeams", lang)}</h2>
            <button className="p-2 hover:bg-white/5 rounded">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {MOCK_TEAMS.map((team) => (
              <button
                key={team.id}
                onClick={() => setActiveTeam(team)}
                className={`w-full p-3 rounded-lg text-left transition ${
                  activeTeam.id === team.id
                    ? "bg-white/10"
                    : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{team.name}</span>
                  {team.unread > 0 && (
                    <span className="w-5 h-5 bg-blue-500 rounded-full text-xs flex items-center justify-center">
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
        <div className="flex-1 card flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{activeTeam.name}</h3>
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Users className="w-4 h-4" />
                {activeTeam.members.length} agents
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {MOCK_MESSAGES.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.type === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                    msg.type === "user"
                      ? "bg-blue-500"
                      : "bg-white/10"
                  }`}
                >
                  {msg.type === "user" ? "Y" : "A"}
                </div>
                <div
                  className={`max-w-md px-4 py-2 rounded-lg ${
                    msg.type === "user"
                      ? "bg-blue-500/20 text-blue-100"
                      : "bg-white/5"
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
                placeholder="Type a message..."
                className="input flex-1"
              />
              <button className="btn-primary px-4">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
