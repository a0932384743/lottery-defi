"use client";

import { useReadContract } from "wagmi";
import { formatEther } from "viem";
import { LOTTERY_ABI } from "@/lib/abi";
import { LOTTERY_ADDRESS } from "@/lib/constants";

type DrawResult = {
  lotteryId:     bigint;
  winner:        `0x${string}`;
  prize:         bigint;
  timestamp:     bigint;
  uniquePlayers: bigint;
  totalTickets:  bigint;
};

export function DrawHistory() {
  const { data: history } = useReadContract({
    address: LOTTERY_ADDRESS,
    abi: LOTTERY_ABI,
    functionName: "getDrawHistory",
  });

  const draws: DrawResult[] = history ? [...(history as DrawResult[])].reverse() : [];

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Draw History</h2>

      {draws.length === 0 ? (
        <div className="text-center text-gray-500 py-10 text-sm">
          <div className="text-4xl mb-3 select-none">🎰</div>
          No draws yet — be the first to play!
        </div>
      ) : (
        <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
          {draws.map((draw) => (
            <DrawCard key={Number(draw.lotteryId)} draw={draw} />
          ))}
        </div>
      )}
    </div>
  );
}

function DrawCard({ draw }: { draw: DrawResult }) {
  const date = new Date(Number(draw.timestamp) * 1000);
  const dateStr = date.toLocaleDateString("zh-TW", {
    month: "short",
    day:   "numeric",
    hour:  "2-digit",
    minute:"2-digit",
  });
  const prize       = parseFloat(formatEther(draw.prize)).toFixed(4);
  const shortWinner = `${draw.winner.slice(0, 6)}…${draw.winner.slice(-4)}`;

  return (
    <div className="bg-white/5 hover:bg-white/8 rounded-xl p-4 border border-white/5 transition-colors">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-purple-400">Round #{Number(draw.lotteryId)}</span>
        <span className="text-xs text-gray-500">{dateStr}</span>
      </div>
      <div className="font-mono text-sm text-white/80 mb-2">{shortWinner}</div>
      <div className="flex items-center justify-between">
        <span className="text-yellow-400 font-bold text-sm">{prize} ETH</span>
        <span className="text-gray-500 text-xs">
          {Number(draw.uniquePlayers)}p · {Number(draw.totalTickets)}t
        </span>
      </div>
    </div>
  );
}
