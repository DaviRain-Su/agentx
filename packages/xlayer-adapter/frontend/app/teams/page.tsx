"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { useWeb3 } from "@/components/Web3Provider";
import { ethers } from "ethers";
import { Plus, Send, Users, Loader2, Star, DollarSign, Clock, MessageSquare } from "lucide-react";

// ABI for TeamRegistry (simplified)
const TEAM_REGISTRY_ABI = [
  "function createTeam(string name, string description, uint256 price, uint256 minDuration, bytes32[] agentDIDs, uint8[] roles) returns (bytes32 teamId)",
  "function hireTeam(bytes32 teamId, uint256 duration) returns (bytes32 sessionId)",
  "function getTeam(bytes32 teamId) view returns (tuple(bytes32 teamId, string name, string description, address creator, uint256 price, uint256 minDuration, bytes32[] agentDIDs, uint8 status, uint256 totalHires, uint256 totalRevenue, uint256 averageRating, uint256 createdAt))",
  "function getAllActiveTeams() view returns (bytes32[] memory)",
  "function getCreatorTeams(address creator) view returns (bytes32[] memory)",
  "event TeamCreated(bytes32 indexed teamId, string name, address indexed creator, uint256 price, bytes32[] agentDIDs)",
  "event TeamHired(bytes32 indexed sessionId, bytes32 indexed teamId, address indexed hirer, uint256 amount, uint256 duration)",
];

const TEAM_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_TEAM_REGISTRY_ADDRESS || "0x0000000000000000000000000000000000000000";

interface Team {
  teamId: string;
  name: string;
  description: string;
  creator: string;
  price: string;        // per hour in USDC
  minDuration: number;  // in seconds
  agentDIDs: string[];
  status: number;
  totalHires: number;
  totalRevenue: string;
  averageRating: number;
  createdAt: Date;
}

interface Message {
  id: string;
  sender: string;
  type: "agent" | "user" | "system";
  content: string;
  timestamp: Date;
}

export default function TeamsPage() {
  const { lang } = useLangStore();
  const { address, signer, usdc } = useWeb3();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHiring, setIsHiring] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [teamRegistry, setTeamRegistry] = useState<ethers.Contract | null>(null);

  // Initialize contract
  useEffect(() => {
    if (!signer) return;
    const contract = new ethers.Contract(TEAM_REGISTRY_ADDRESS, TEAM_REGISTRY_ABI, signer);
    setTeamRegistry(contract);
  }, [signer]);

  // Fetch teams
  const fetchTeams = useCallback(async () => {
    if (!teamRegistry) return;
    
    setIsLoading(true);
    try {
      const teamIds = await teamRegistry.getAllActiveTeams();
      
      const teamPromises = teamIds.map(async (id: string) => {
        try {
          const team = await teamRegistry.getTeam(id);
          return {
            teamId: id,
            name: team.name,
            description: team.description,
            creator: team.creator,
            price: ethers.formatUnits(team.price, 6),
            minDuration: Number(team.minDuration),
            agentDIDs: team.agentDIDs,
            status: team.status,
            totalHires: Number(team.totalHires),
            totalRevenue: ethers.formatUnits(team.totalRevenue, 6),
            averageRating: Number(team.averageRating) / 100, // Convert from 0-500 to 0-5
            createdAt: new Date(Number(team.createdAt) * 1000),
          };
        } catch (err) {
          console.error(`Failed to fetch team ${id}:`, err);
          return null;
        }
      });

      const fetchedTeams = (await Promise.all(teamPromises))
        .filter((t): t is Team => t !== null)
        .sort((a, b) => b.totalHires - a.totalHires);

      setTeams(fetchedTeams);
    } catch (err) {
      console.error("Failed to fetch teams:", err);
    } finally {
      setIsLoading(false);
    }
  }, [teamRegistry]);

  // Poll teams
  useEffect(() => {
    if (!teamRegistry) return;
    fetchTeams();
    const interval = setInterval(fetchTeams, 10000);
    return () => clearInterval(interval);
  }, [teamRegistry, fetchTeams]);

  // Hire team
  const handleHireTeam = async (team: Team) => {
    if (!teamRegistry || !usdc || !address) return;
    
    setIsHiring(true);
    try {
      // Calculate cost (hire for 1 hour minimum)
      const duration = Math.max(3600, team.minDuration); // 1 hour or min duration
      const cost = ethers.parseUnits(team.price, 6);
      
      // Approve USDC
      const approveTx = await usdc.approve(TEAM_REGISTRY_ADDRESS, cost);
      await approveTx.wait();
      
      // Hire team
      const tx = await teamRegistry.hireTeam(team.teamId, duration);
      const receipt = await tx.wait();
      
      // Extract session ID from event
      // For now, just show success
      alert(`Successfully hired ${team.name} for 1 hour!`);
      
      // Start mock chat session
      setActiveTeam(team);
      setMessages([
        {
          id: "system-1",
          sender: "System",
          type: "system",
          content: `You have hired ${team.name}. The team is now active and ready to assist you.`,
          timestamp: new Date(),
        },
        {
          id: "leader-1",
          sender: "Team Leader",
          type: "agent",
          content: "Hello! I'm the team leader. How can we help you today?",
          timestamp: new Date(),
        },
      ]);
      
    } catch (err) {
      console.error("Failed to hire team:", err);
      alert("Failed to hire team. Please try again.");
    } finally {
      setIsHiring(false);
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (!message.trim() || !activeTeam) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "You",
      type: "user",
      content: message,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMsg]);
    setMessage("");
    setIsSending(true);

    // Simulate team discussion
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Add agent responses
    const responses: Message[] = [
      {
        id: `agent-${Date.now()}-1`,
        sender: activeTeam.agentDIDs[0].slice(0, 8) + "...",
        type: "agent",
        content: "I'll analyze this request and coordinate with the team.",
        timestamp: new Date(),
      },
    ];

    setMessages(prev => [...prev, ...responses]);
    setIsSending(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-140px)] flex gap-6">
        {/* Team List */}
        <div className="w-80 border border-white/10 bg-white/5 flex flex-col">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="font-medium text-white">{lang === "en" ? "Teams" : "团队"}</h2>
              <p className="text-xs text-white/40">{teams.length} teams available</p>
            </div>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="p-2 hover:bg-white/5 transition text-white/60 hover:text-white"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 text-white/40 animate-spin mx-auto" />
              </div>
            ) : teams.length === 0 ? (
              <div className="p-8 text-center text-white/40">
                <p>No teams available</p>
              </div>
            ) : (
              teams.map((team) => (
                <div
                  key={team.teamId}
                  className={`p-4 border-b border-white/10 cursor-pointer transition-all ${
                    activeTeam?.teamId === team.teamId
                      ? "bg-white/10"
                      : "hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-medium text-white">{team.name}</span>
                    <div className="flex items-center gap-1 text-yellow-400 text-xs">
                      <Star className="w-3 h-3 fill-current" />
                      <span>{team.averageRating.toFixed(1)}</span>
                    </div>
                  </div>
                  
                  <p className="text-sm text-white/50 mb-2 line-clamp-2">{team.description}</p>
                  
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-white/40">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {team.agentDIDs.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> {team.price}/h
                      </span>
                    </div>
                    <span className="text-white/30">{team.totalHires} hires</span>
                  </div>
                  
                  <button
                    onClick={() => handleHireTeam(team)}
                    disabled={isHiring}
                    className="w-full mt-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition disabled:opacity-50"
                  >
                    {isHiring ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Hiring...
                      </span>
                    ) : (
                      "Hire Team"
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 border border-white/10 bg-white/5 flex flex-col">
          {activeTeam ? (
            <>
              {/* Header */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white">{activeTeam.name}</h3>
                    <div className="flex items-center gap-4 text-sm text-white/50 mt-1">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {activeTeam.agentDIDs.length} agents
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Min {formatDuration(activeTeam.minDuration)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-medium text-white">{activeTeam.price} USDC/h</p>
                    <p className="text-xs text-white/40">{activeTeam.totalHires} previous hires</p>
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
                          : msg.type === "system"
                          ? "bg-yellow-500/20 text-yellow-400"
                          : "border border-white/20 text-white/60"
                      }`}
                    >
                      {msg.type === "user" ? "Y" : msg.type === "system" ? "S" : "A"}
                    </div>
                    <div
                      className={`max-w-md px-4 py-2 ${
                        msg.type === "user"
                          ? "bg-white/10 text-white"
                          : msg.type === "system"
                          ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-200"
                          : "border border-white/10 text-white/80"
                      }`}
                    >
                      {msg.type !== "system" && (
                        <div className="text-xs text-white/50 mb-1">{msg.sender}</div>
                      )}
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
                    placeholder="Type your message to the team..."
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
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <p className="text-white/40 mb-2">Select a team to start collaboration</p>
                <p className="text-white/30 text-sm">Hire a team to enable real-time chat</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
