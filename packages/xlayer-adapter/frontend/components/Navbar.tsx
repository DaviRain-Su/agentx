"use client";

import { useWeb3 } from "./Web3Provider";
import { Zap, Wallet, ExternalLink } from "lucide-react";

export function Navbar() {
  const { address, isConnected, connect } = useWeb3();

  return (
    <nav className="sticky top-0 z-50 glass-card border-b border-white/5">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">Gradience</h1>
              <p className="text-xs text-gray-400">Agent Orchestration</p>
            </div>
          </div>

          {/* Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <a href="/" className="text-sm text-gray-300 hover:text-white transition">
              Build
            </a>
            <a href="/tasks" className="text-sm text-gray-300 hover:text-white transition">
              My Tasks
            </a>
            <a 
              href="https://www.oklink.com/x-layer-testnet" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-gray-300 hover:text-white transition flex items-center gap-1"
            >
              Explorer
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Connect Button */}
          <div>
            {isConnected ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
              </div>
            ) : (
              <button
                onClick={connect}
                className="btn-primary flex items-center gap-2"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
