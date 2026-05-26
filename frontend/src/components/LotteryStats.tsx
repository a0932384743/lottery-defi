"use client";

import { useReadContracts, useBlockNumber } from "wagmi";
import { useEffect } from "react";
import { formatEther } from "viem";
import { LOTTERY_ABI } from "@/lib/abi";
import { LOTTERY_ADDRESS } from "@/lib/constants";

const base = { address: LOTTERY_ADDRESS, abi: LOTTERY_ABI } as const;

export function LotteryStats() {
  const { data, refetch } = useReadContracts({
    contracts: [
      { ...base, functionName: "getPrizePool"      },
      { ...base, functionName: "getLotteryState"   },
      { ...base, functionName: "s_lotteryId"       },
      { ...base, functionName: "getUniquePlayers"  },
      { ...base, functionName: "getTicketEntries"  },
      { ...base, functionName: "paused"            },
    ],
  });

  const { data: blockNumber } = useBlockNumber({ watch: true });
  useEffect(() => { refetch(); }, [blockNumber, refetch]);

  const prizePool     = data?.[0].result as bigint | undefined;
  const lotteryState  = data?.[1].result as number | undefined;
  const lotteryId     = data?.[2].result as bigint | undefined;
  const uniquePlayers = data?.[3].result as `0x${string}`[] | undefined;
  const ticketEntries = data?.[4].result as `0x${string}`[] | undefined;
  const isPaused      = data?.[5].result as boolean | undefined;

  const stateLabel = lotteryState === undefined ? "..." : lotteryState === 0 ? "OPEN" : "CALCULATING";
  const stateColor = lotteryState === 0 ? "text-green-400" : "text-yellow-400";
  const poolStr    = prizePool !== undefined
    ? `${parseFloat(formatEther(prizePool)).toFixed(4)} ETH`
    : "...";

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Current Round</h2>
        {isPaused && (
          <span className="text-xs text-red-400 bg-red-500/20 border border-red-500/30 px-3 py-1 rounded-full">
            ⏸ Paused
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <StatCard icon="💰" label="Prize Pool"  value={poolStr}                                      accent="text-yellow-400" />
        <StatCard icon="🎯" label="Round #"     value={lotteryId?.toString() ?? "..."}               accent="text-blue-400"   />
        <StatCard icon="👥" label="Players"     value={uniquePlayers?.length?.toString() ?? "..."}   accent="text-purple-400" />
        <StatCard icon="🎟" label="Tickets"     value={ticketEntries?.length?.toString() ?? "..."}   accent="text-pink-400"   />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className={`font-semibold ${stateColor}`}>● {stateLabel}</span>
        {lotteryState === 1 && (
          <span className="text-gray-400 text-xs animate-pulse">
            — Awaiting Chainlink VRF response...
          </span>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, accent,
}: { icon: string; label: string; value: string; accent: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-4 text-center">
      <div className="text-2xl mb-1 select-none">{icon}</div>
      <div className={`text-xl font-bold ${accent} truncate`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}
