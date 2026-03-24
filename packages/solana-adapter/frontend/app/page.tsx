"use client";

import { SolanaProvider } from "@/components/SolanaProvider";
import { Navbar } from "@/components/Navbar";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowRight, Cpu, Shield, Zap, Users } from "lucide-react";
import Link from "next/link";

const FEATURES = [
  { icon: Cpu, title: "Agent Registry", desc: "Metaplex-compatible on-chain agent identities", href: "/registry" },
  { icon: Users, title: "A2A Market", desc: "Agent-to-Agent service marketplace with SPL tokens", href: "/market" },
  { icon: Shield, title: "Reputation System", desc: "On-chain trust scores for autonomous agents", href: "/market" },
  { icon: Zap, title: "Workflow Engine", desc: "Sequential & parallel task orchestration", href: "/market" },
];

function HomePage() {
  const { connected } = useWallet();

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-20 space-y-20">
        {/* Hero */}
        <div className="space-y-6">
          <span className="text-xs text-white/40 uppercase tracking-[0.3em]">Solana Agent Protocol</span>
          <h1 className="text-5xl lg:text-7xl font-light text-white leading-tight">
            Gradience<br />
            <span className="text-white/40">on Solana</span>
          </h1>
          <p className="text-lg text-white/50 max-w-xl">
            Decentralized AI Agent orchestration with Metaplex-native identities,
            SPL token payments, and trustless A2A collaboration.
          </p>
          <div className="flex items-center gap-4 pt-4">
            <Link
              href="/market"
              className="flex items-center gap-2 px-6 py-3 bg-white text-black font-medium hover:bg-white/90 transition"
            >
              Open Market <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/registry"
              className="flex items-center gap-2 px-6 py-3 border border-white/20 text-white hover:border-white/50 transition"
            >
              Browse Agents
            </Link>
          </div>
        </div>

        {/* Status */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Network", value: "Devnet" },
            { label: "Agents Registered", value: "0" },
            { label: "Wallet", value: connected ? "Connected" : "Disconnected" },
          ].map((stat) => (
            <div key={stat.label} className="border border-white/10 p-6 bg-white/5">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-3">{stat.label}</p>
              <p className={`text-2xl font-light ${connected && stat.label === "Wallet" ? "text-white" : "text-white/80"}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Features */}
        <div>
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-8">Protocol Modules</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <Link
                  key={f.title}
                  href={f.href}
                  className="group border border-white/10 p-6 hover:border-white/30 transition bg-white/5"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 border border-white/20 flex items-center justify-center group-hover:border-white/50 transition">
                      <Icon className="w-5 h-5 text-white/60 group-hover:text-white" />
                    </div>
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-white/50">{f.desc}</p>
                  <div className="flex items-center gap-2 mt-4 text-white/40 group-hover:text-white transition">
                    <span className="text-sm">Open</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Contracts */}
        <div className="border border-white/10 p-6 bg-white/5">
          <h2 className="text-xs text-white/40 uppercase tracking-[0.2em] mb-4">Deployed Programs</h2>
          <div className="space-y-3">
            {[
              { name: "Agent Registry", note: "Metaplex-compatible, pending deployment" },
              { name: "A2A Market", note: "SPL token escrow, pending deployment" },
              { name: "Reputation", note: "On-chain trust scores, pending deployment" },
            ].map((c) => (
              <div key={c.name} className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0">
                <span className="text-white/80">{c.name}</span>
                <span className="text-white/40">{c.note}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <SolanaProvider>
      <HomePage />
    </SolanaProvider>
  );
}
