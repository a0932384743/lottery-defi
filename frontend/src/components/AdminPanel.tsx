"use client";

import { useEffect } from "react";
import {
  useAccount,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBlockNumber,
} from "wagmi";
import { formatEther } from "viem";
import { LOTTERY_ABI }    from "@/lib/abi";
import { LOTTERY_ADDRESS } from "@/lib/constants";

const base = { address: LOTTERY_ADDRESS, abi: LOTTERY_ABI } as const;

export function AdminPanel() {
  const { address } = useAccount();

  const { data, refetch } = useReadContracts({
    contracts: [
      { ...base, functionName: "owner"             },
      { ...base, functionName: "getLotteryState"   },
      { ...base, functionName: "paused"            },
      { ...base, functionName: "getAccumulatedFees"},
      { ...base, functionName: "getTicketEntries"  },
    ],
  });

  const { data: block } = useBlockNumber({ watch: true });
  useEffect(() => { refetch(); }, [block, refetch]);

  const owner        = data?.[0].result as `0x${string}` | undefined;
  const lotteryState = data?.[1].result as number | undefined;
  const isPaused     = data?.[2].result as boolean | undefined;
  const fees         = data?.[3].result as bigint  | undefined;
  const tickets      = data?.[4].result as `0x${string}`[] | undefined;

  // Only render for contract owner
  if (!address || !owner || address.toLowerCase() !== owner.toLowerCase()) return null;

  const isOpen   = lotteryState === 0;
  const hasPlayers = (tickets?.length ?? 0) > 0;
  const feesEth  = fees ? parseFloat(formatEther(fees)).toFixed(6) : "0";

  const {
    writeContract,
    data: txHash,
    isPending,
    error,
    reset,
  } = useWriteContract();

  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => { if (isSuccess) refetch(); }, [isSuccess, refetch]);

  function call(fn: "requestDraw" | "withdrawFees" | "pause" | "unpause") {
    reset();
    writeContract({ address: LOTTERY_ADDRESS, abi: LOTTERY_ABI, functionName: fn, args: [] });
  }

  const busy = isPending || isLoading;

  return (
    <div className="bg-amber-500/10 backdrop-blur-sm border border-amber-500/20 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl select-none">⚙️</span>
        <h2 className="text-lg font-semibold text-amber-300">Admin Panel</h2>
        <span className="ml-auto text-xs text-amber-400/70 bg-amber-400/10 px-2 py-0.5 rounded-full">
          Owner
        </span>
      </div>

      <div className="space-y-3">
        {/* Request Draw */}
        <button
          onClick={() => call("requestDraw")}
          disabled={!isOpen || isPaused || !hasPlayers || busy}
          className="w-full py-2.5 px-4 rounded-xl font-medium text-sm text-white
            bg-gradient-to-r from-amber-600 to-orange-600
            hover:from-amber-500 hover:to-orange-500
            disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {busy ? "⏳ Processing..." : "🎲 Request Draw (Chainlink VRF)"}
        </button>

        {/* Withdraw Fees */}
        <button
          onClick={() => call("withdrawFees")}
          disabled={!fees || fees === 0n || busy}
          className="w-full py-2.5 px-4 rounded-xl font-medium text-sm text-white
            bg-gradient-to-r from-emerald-700 to-green-700
            hover:from-emerald-600 hover:to-green-600
            disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          💸 Withdraw Fees ({feesEth} ETH)
        </button>

        {/* Pause / Unpause */}
        <button
          onClick={() => call(isPaused ? "unpause" : "pause")}
          disabled={busy}
          className={`w-full py-2.5 px-4 rounded-xl font-medium text-sm text-white transition-all
            disabled:opacity-40 disabled:cursor-not-allowed
            ${isPaused
              ? "bg-gradient-to-r from-blue-700 to-cyan-700 hover:from-blue-600 hover:to-cyan-600"
              : "bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600"
            }`}
        >
          {isPaused ? "▶️ Unpause Lottery" : "⏸️ Pause Lottery"}
        </button>
      </div>

      {/* Feedback */}
      {isSuccess && (
        <div className="mt-3 p-2.5 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 text-xs text-center">
          ✅ Transaction confirmed
        </div>
      )}
      {error && (
        <div className="mt-3 p-2.5 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-xs break-all">
          ❌ {(error as Error).message?.split("\n")[0]}
        </div>
      )}

      {/* Hint when draw is blocked */}
      {isOpen && !hasPlayers && !busy && (
        <p className="mt-3 text-xs text-gray-500 text-center">
          No participants yet — draw disabled until someone buys a ticket
        </p>
      )}
    </div>
  );
}
