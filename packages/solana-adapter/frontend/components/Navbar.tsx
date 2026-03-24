"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";

export function Navbar() {
  return (
    <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-white font-bold tracking-wider">
        GRADIENCE <span className="text-white/40 text-sm font-normal">/ SOLANA</span>
      </Link>
      <div className="flex items-center gap-6">
        <Link href="/market" className="text-sm text-white/60 hover:text-white transition">Market</Link>
        <Link href="/registry" className="text-sm text-white/60 hover:text-white transition">Registry</Link>
        <WalletMultiButton
          style={{
            background: "white",
            color: "black",
            borderRadius: 0,
            fontSize: "12px",
            fontFamily: "inherit",
            height: "36px",
            padding: "0 16px",
          }}
        />
      </div>
    </nav>
  );
}
