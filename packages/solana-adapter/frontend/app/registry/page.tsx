"use client";

import { SolanaProvider } from "@/components/SolanaProvider";
import { Navbar } from "@/components/Navbar";
import { useWallet } from "@solana/wallet-adapter-react";
import { Bot, Plus } from "lucide-react";

const MOCK_REGISTRY = [
  { id: "reg-1", name: "Alpha-Agent-SOL", did: "did:sol:7xK...mNp", owner: "7xKa...1234", capabilities: ["price-feed", "swap"], registered: "2024-03-20" },
  { id: "reg-2", name: "Scout-NFT-Bot", did: "did:sol:4aB...rQt", owner: "4aBc...5678", capabilities: ["nft-scan", "floor-price"], registered: "2024-03-21" },
  { id: "reg-3", name: "Yield-Farmer-V2", did: "did:sol:9cD...sSu", owner: "9cDe...9012", capabilities: ["lp-manage", "compound"], registered: "2024-03-22" },
];

function RegistryPage() {
  const { connected, publicKey } = useWallet();

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs text-white/40 uppercase tracking-[0.2em] block mb-2">Metaplex-Compatible</span>
            <h1 className="text-4xl lg:text-5xl font-light text-white">Agent Registry</h1>
          </div>
          <button
            disabled={!connected}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Plus className="w-4 h-4" /> Register Agent
          </button>
        </div>

        {connected && publicKey && (
          <div className="border border-white/20 p-4 bg-white/5">
            <p className="text-xs text-white/40 mb-1">Connected Wallet</p>
            <p className="text-white font-mono text-sm">{publicKey.toBase58()}</p>
          </div>
        )}

        {/* Registry Table */}
        <div className="border border-white/10">
          <div className="grid grid-cols-4 text-xs text-white/40 uppercase tracking-widest p-4 border-b border-white/10">
            <span>Agent</span>
            <span>DID</span>
            <span>Capabilities</span>
            <span>Registered</span>
          </div>
          {MOCK_REGISTRY.map((agent) => (
            <div key={agent.id} className="grid grid-cols-4 p-4 border-b border-white/5 hover:bg-white/5 transition items-center">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border border-white/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{agent.name}</p>
                  <p className="text-xs text-white/40">{agent.owner}</p>
                </div>
              </div>
              <p className="text-xs text-white/60 font-mono">{agent.did}</p>
              <div className="flex flex-wrap gap-1">
                {agent.capabilities.map((cap) => (
                  <span key={cap} className="text-[10px] border border-white/20 px-2 py-0.5 text-white/60">{cap}</span>
                ))}
              </div>
              <p className="text-xs text-white/40">{agent.registered}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-white/30 text-center">
          Registry program: pending deployment to Solana Devnet
        </p>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <SolanaProvider>
      <RegistryPage />
    </SolanaProvider>
  );
}
