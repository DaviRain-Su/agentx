"use client";

import { SolanaProvider } from "@/components/SolanaProvider";
import { Navbar } from "@/components/Navbar";
import { useWallet } from "@solana/wallet-adapter-react";
import { Star, Zap, Shield, BarChart2, Bot, ArrowRight } from "lucide-react";

const MOCK_AGENTS = [
  {
    id: "sol-agent-1",
    name: "Alpha Arbitrageur",
    category: "DeFi",
    rating: 4.8,
    tasks: 1204,
    price: "0.5 SOL",
    desc: "Cross-DEX arbitrage detection and execution on Solana",
    icon: Zap,
  },
  {
    id: "sol-agent-2",
    name: "NFT Scout",
    category: "NFT",
    rating: 4.6,
    tasks: 892,
    price: "0.2 SOL",
    desc: "Metaplex NFT monitoring and floor price alerts",
    icon: Star,
  },
  {
    id: "sol-agent-3",
    name: "Sentinel Shield",
    category: "Security",
    rating: 4.9,
    tasks: 3201,
    price: "1.0 SOL",
    desc: "Smart contract audit and exploit pattern detection",
    icon: Shield,
  },
  {
    id: "sol-agent-4",
    name: "Onchain Analyst",
    category: "Analytics",
    rating: 4.7,
    tasks: 567,
    price: "0.3 SOL",
    desc: "Wallet activity analysis and portfolio tracking",
    icon: BarChart2,
  },
  {
    id: "sol-agent-5",
    name: "Drift Strategist",
    category: "Perps",
    rating: 4.5,
    tasks: 431,
    price: "0.8 SOL",
    desc: "Automated perpetual trading strategies on Drift Protocol",
    icon: Bot,
  },
  {
    id: "sol-agent-6",
    name: "Raydium Farmer",
    category: "Yield",
    rating: 4.4,
    tasks: 288,
    price: "0.4 SOL",
    desc: "Auto-compound liquidity positions on Raydium",
    icon: Zap,
  },
];

const CATEGORIES = ["All", "DeFi", "NFT", "Security", "Analytics", "Perps", "Yield"];

function MarketPage() {
  const { connected } = useWallet();

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-12 space-y-12">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Marketplace</span>
            <h1 className="text-4xl lg:text-5xl font-light text-white">A2A Market</h1>
          </div>
          <button
            disabled={!connected}
            className="px-4 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            + Publish Agent
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`px-4 py-1.5 text-xs uppercase tracking-wider border transition ${
                cat === "All"
                  ? "border-white bg-white text-black"
                  : "border-white/20 text-white/60 hover:border-white/50 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Agent Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {MOCK_AGENTS.map((agent) => {
            const Icon = agent.icon;
            return (
              <div key={agent.id} className="border border-white/10 p-6 hover:border-white/30 transition bg-white/5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 border border-white/20 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-white/60" />
                  </div>
                  <span className="text-xs text-white/40 border border-white/10 px-2 py-1">{agent.category}</span>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-white">{agent.name}</h3>
                  <p className="text-sm text-white/50 mt-1">{agent.desc}</p>
                </div>

                <div className="flex items-center justify-between text-sm text-white/40">
                  <span>★ {agent.rating}</span>
                  <span>{agent.tasks.toLocaleString()} tasks</span>
                  <span className="text-white font-medium">{agent.price}</span>
                </div>

                <button
                  disabled={!connected}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Deploy Agent <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {!connected && (
          <p className="text-center text-white/40 text-sm">
            Connect your Phantom wallet to deploy agents
          </p>
        )}
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <SolanaProvider>
      <MarketPage />
    </SolanaProvider>
  );
}
