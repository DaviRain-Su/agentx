"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useLangStore } from "@/store/lang";
import { t } from "@/lib/i18n";
import { Search, Plus, Star, Download, Filter, Grid, List } from "lucide-react";

const MOCK_AGENTS = [
  {
    id: "1",
    name: "Price Oracle V2",
    description: "Real-time price monitoring across 50+ DEXs with sub-second updates",
    author: "0x742d...8a3f",
    rating: 4.8,
    downloads: 1284,
    price: 0.1,
    category: "Data",
    tags: ["price", "oracle", "realtime"],
  },
  {
    id: "2",
    name: "MEV Protector",
    description: "Advanced sandwich attack protection for high-value trades",
    author: "0x991a...2b7c",
    rating: 4.9,
    downloads: 892,
    price: 0.5,
    category: "Security",
    tags: ["mev", "protection", "trading"],
  },
  {
    id: "3",
    name: "Yield Optimizer",
    description: "Auto-compound and rebalance LP positions across multiple protocols",
    author: "0x3f21...9d1e",
    rating: 4.6,
    downloads: 2156,
    price: 0.3,
    category: "DeFi",
    tags: ["yield", "farming", "automation"],
  },
  {
    id: "4",
    name: "Sentiment Analyzer",
    description: "Social media sentiment analysis for token trend prediction",
    author: "0x8c44...5a2b",
    rating: 4.3,
    downloads: 567,
    price: 0.2,
    category: "AI",
    tags: ["sentiment", "social", "ml"],
  },
  {
    id: "5",
    name: "Liquidity Scout",
    description: "Find best liquidity pools with impermanent loss calculator",
    author: "0x2a91...7e4c",
    rating: 4.7,
    downloads: 943,
    price: 0.15,
    category: "DeFi",
    tags: ["liquidity", "pools", "analysis"],
  },
  {
    id: "6",
    name: "Gas Optimizer",
    description: "Predict optimal gas prices and transaction timing",
    author: "0x5d33...1f8a",
    rating: 4.5,
    downloads: 1523,
    price: 0.08,
    category: "Trading",
    tags: ["gas", "optimization", "timing"],
  },
];

const CATEGORIES = ["All", "Data", "Security", "DeFi", "AI", "Trading"];

export default function MarketPage() {
  const { lang } = useLangStore();
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showPublish, setShowPublish] = useState(false);

  const filteredAgents = MOCK_AGENTS.filter((agent) => {
    const matchesCategory = activeCategory === "All" || agent.category === activeCategory;
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <DashboardLayout>
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold mb-1">{t("navMarket", lang)}</h1>
            <p className="text-white/60">Discover and deploy agents from the marketplace</p>
          </div>
          <button
            onClick={() => setShowPublish(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Publish Agent
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex-1 min-w-[300px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-white/40" />
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${
                  activeCategory === cat
                    ? "bg-white text-black"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-white/5 rounded-md p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded ${viewMode === "grid" ? "bg-white/10" : ""}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded ${viewMode === "list" ? "bg-white/10" : ""}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Agent Grid/List */}
        <div className={viewMode === "grid" ? "grid md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} viewMode={viewMode} />
          ))}
        </div>

        {/* Empty State */}
        {filteredAgents.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Search className="w-8 h-8 text-white/40" />
            </div>
            <h3 className="text-lg font-medium mb-1">No agents found</h3>
            <p className="text-white/40">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0f] border border-white/10 rounded-lg p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium">Publish Agent</h3>
              <button onClick={() => setShowPublish(false)} className="text-white/40 hover:text-white">
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-1">Agent Name</label>
                <input type="text" className="input" placeholder="My Agent" />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Description</label>
                <textarea className="input h-24" placeholder="What does this agent do?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Category</label>
                  <select className="input">
                    {CATEGORIES.slice(1).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Price (USDC)</label>
                  <input type="number" className="input" placeholder="0.1" step="0.01" />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button className="btn-primary flex-1">Publish</button>
                <button onClick={() => setShowPublish(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function AgentCard({ agent, viewMode }: { agent: typeof MOCK_AGENTS[0]; viewMode: "grid" | "list" }) {
  if (viewMode === "list") {
    return (
      <div className="card p-4 flex items-center gap-4 hover:border-white/20">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-2xl">
          🤖
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-medium truncate">{agent.name}</h3>
            <span className="badge badge-success text-xs">{agent.category}</span>
          </div>
          <p className="text-sm text-white/50 truncate">{agent.description}</p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1">
            <Star className="w-4 h-4 text-yellow-500" />
            {agent.rating}
          </div>
          <div className="flex items-center gap-1 text-white/40">
            <Download className="w-4 h-4" />
            {agent.downloads}
          </div>
          <div className="text-right min-w-[80px]">
            <div className="font-medium">${agent.price}</div>
            <div className="text-xs text-white/40">per call</div>
          </div>
          <button className="btn-primary">Deploy</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5 hover:border-white/20 flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-3xl">
          🤖
        </div>
        <span className="badge badge-success">{agent.category}</span>
      </div>

      <h3 className="font-medium text-lg mb-2">{agent.name}</h3>
      <p className="text-sm text-white/50 mb-4 line-clamp-2 flex-1">{agent.description}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {agent.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="text-xs px-2 py-1 bg-white/5 rounded text-white/60">
            #{tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1">
            <Star className="w-4 h-4 text-yellow-500" />
            {agent.rating}
          </span>
          <span className="flex items-center gap-1 text-white/40">
            <Download className="w-4 h-4" />
            {agent.downloads}
          </span>
        </div>
        <div className="text-right">
          <div className="font-medium text-lg">${agent.price}</div>
        </div>
      </div>

      <button className="btn-primary w-full mt-4">Deploy</button>
    </div>
  );
}
