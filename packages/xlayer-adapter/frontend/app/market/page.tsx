"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { Search, Plus, Star, Zap, Loader2, CheckCircle } from "lucide-react";
import { mockService } from "@/lib/mockService";

const MOCK_AGENTS = [
  { id: "1", name: "Aethelgard-9", subtitle: "Advanced Liquidity Orchestrator", description: "Cross-chain yield arbitrage and risk mitigation strategies with 99.98% efficiency.", rating: 4.9, downloads: 1284, price: 0.1, category: "DeFi", featured: true },
  { id: "2", name: "Vortex Analytics", subtitle: "Predictive Data Modeling", description: "Real-time market analysis with ML-powered predictions.", rating: 4.8, downloads: 892, price: 0.5, category: "Analytics" },
  { id: "3", name: "Sentinel-X", subtitle: "Security Guardian", description: "MEV protection and sandwich attack prevention for high-value trades.", rating: 4.7, downloads: 2156, price: 0.3, category: "Security" },
  { id: "4", name: "YieldSensei", subtitle: "Auto-Compounding Vault", description: "Automated yield farming with impermanent loss hedging.", rating: 4.6, downloads: 567, price: 0.2, category: "DeFi" },
  { id: "5", name: "TrendHunter", subtitle: "Social Sentiment AI", description: "Twitter and Discord sentiment analysis for token trends.", rating: 4.5, downloads: 943, price: 0.15, category: "AI" },
  { id: "6", name: "GasOracle", subtitle: "Transaction Optimizer", description: "Predict optimal gas prices and transaction timing.", rating: 4.4, downloads: 1523, price: 0.08, category: "Trading" },
];

const CATEGORIES = ["All", "DeFi", "AI", "Security", "Analytics", "Trading"];

type DeployState = "idle" | "deploying" | "success";

export default function MarketPage() {
  const { lang } = useLangStore();
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [deployedAgent, setDeployedAgent] = useState<string | null>(null);

  const handleDeploy = async (agentName: string) => {
    setDeployState("deploying");
    setDeployedAgent(agentName);
    
    // Mock deployment delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setDeployState("success");
    
    // Reset after showing success
    setTimeout(() => {
      setDeployState("idle");
      setDeployedAgent(null);
    }, 3000);
  };

  const filteredAgents = MOCK_AGENTS.filter((agent) => {
    const matchesCategory = activeCategory === "All" || agent.category === activeCategory;
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const featuredAgent = MOCK_AGENTS.find(a => a.featured);
  const regularAgents = filteredAgents.filter(a => !a.featured);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Elite Nodes</span>
            <h1 className="text-4xl lg:text-5xl font-light text-white">Agent Market</h1>
          </div>
          <button className="px-6 py-3 bg-white text-black font-medium hover:bg-white/90 transition flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Publish Agent
          </button>
        </div>

        {/* Featured Card */}
        {featuredAgent && (
          <div className="border border-white/10 p-8 hover:border-white/30 transition-all bg-white/5">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 border border-white/20 text-[10px] uppercase tracking-widest text-white/60">Protocol Sovereign</span>
                  <span className="w-2 h-2 bg-white animate-pulse" />
                </div>
                <h2 className="text-5xl font-light text-white mb-4">{featuredAgent.name}</h2>
                <p className="text-white/50 mb-6 max-w-md">{featuredAgent.description}</p>
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => handleDeploy(featuredAgent.name)}
                    disabled={deployState === "deploying"}
                    className="px-6 py-3 bg-white text-black font-medium hover:bg-white/90 transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {deployState === "deploying" && deployedAgent === featuredAgent.name ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deploying...
                      </>
                    ) : deployState === "success" && deployedAgent === featuredAgent.name ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Deployed!
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        Deploy Agent
                      </>
                    )}
                  </button>
                  <div>
                    <span className="text-xs text-white/40 uppercase tracking-widest block">Efficiency</span>
                    <span className="text-white">99.98%</span>
                  </div>
                </div>
              </div>
              <div className="h-64 border border-white/10 bg-white/5 flex items-center justify-center">
                <span className="text-8xl">🤖</span>
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
              placeholder="Search agents..."
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

        {/* Deploy Success Toast */}
        {deployState === "success" && (
          <div className="fixed bottom-8 right-8 bg-green-500 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4">
            <CheckCircle className="w-6 h-6" />
            <div>
              <p className="font-medium">Agent Deployed Successfully!</p>
              <p className="text-sm text-white/80">{deployedAgent} is now active</p>
            </div>
          </div>
        )}

        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {regularAgents.map((agent) => (
            <div key={agent.id} className="p-6 border border-white/10 hover:border-white/30 transition-all bg-white/5 group">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 border border-white/20 flex items-center justify-center text-2xl bg-white/5">🤖</div>
                <div>
                  <h4 className="font-medium text-white">{agent.name}</h4>
                  <span className="text-[10px] text-white/40 uppercase tracking-widest">{agent.category}</span>
                </div>
              </div>
              <p className="text-sm text-white/50 mb-4">{agent.description}</p>
              <div className="flex justify-between items-center pt-4 border-t border-white/10">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-white fill-white" />
                  <span className="text-white">{agent.rating}</span>
                </div>
                <span className="text-white font-medium">${agent.price}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
