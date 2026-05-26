"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function Header() {
  return (
    <header className="border-b border-white/10 bg-black/30 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl select-none">🎰</span>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">DeFi Lottery</h1>
            <p className="text-xs text-purple-400">Powered by Chainlink VRF</p>
          </div>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
