"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBlockNumber,
} from "wagmi";
import { formatEther } from "viem";
import { LOTTERY_ABI }           from "@/lib/abi";
import { LOTTERY_ADDRESS, TICKET_PRICE, MAX_TICKETS_PER_PLAYER } from "@/lib/constants";

const base = { address: LOTTERY_ADDRESS, abi: LOTTERY_ABI } as const;

export function BuyTicket() {
  const { address, isConnected } = useAccount();
  const [count, setCount] = useState(1);

  const { data, refetch } = useReadContracts({
    contracts: [
      { ...base, functionName: "getLotteryState" },
      { ...base, functionName: "paused"          },
      { ...base, functionName: "getPlayerTickets", args: address ? [address] : ["0x0000000000000000000000000000000000000000"] },
    ],
  });

  const { data: block } = useBlockNumber({ watch: true });
  useEffect(() => { refetch(); }, [block, refetch]);

  const lotteryState = data?.[0].result as number | undefined;
  const isPaused     = data?.[1].result as boolean | undefined;
  const myTickets    = data?.[2].result as bigint  | undefined;

  const myTicketsNum = Number(myTickets ?? 0n);
  const remaining    = MAX_TICKETS_PER_PLAYER - myTicketsNum;
  const isOpen       = lotteryState === 0;
  const totalCost    = TICKET_PRICE * BigInt(count);

  const {
    writeContract,
    data: txHash,
    isPending,
    error,
    reset,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) { refetch(); setCount(1); }
  }, [isSuccess, refetch]);

  function handleBuy() {
    reset();
    writeContract({
      address: LOTTERY_ADDRESS,
      abi: LOTTERY_ABI,
      functionName: "buyTickets",
      args: [BigInt(count)],
      value: totalCost,
    });
  }

  const canBuy = isConnected && isOpen && !isPaused && !isPending && !isConfirming && remaining > 0;

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Buy Tickets</h2>

      <div className="space-y-4">
        {/* Info row */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Price per ticket</span>
          <span className="text-white font-medium">{formatEther(TICKET_PRICE)} ETH</span>
        </div>

        {isConnected && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">My tickets this round</span>
            <span className={`font-medium ${myTicketsNum > 0 ? "text-purple-400" : "text-gray-300"}`}>
              {myTicketsNum} / {MAX_TICKETS_PER_PLAYER}
            </span>
          </div>
        )}

        {/* Quantity control */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Number of tickets</label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCount((c) => Math.max(1, c - 1))}
              disabled={count <= 1}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold transition-colors disabled:opacity-30"
            >−</button>
            <span className="text-3xl font-bold text-white w-12 text-center">{count}</span>
            <button
              onClick={() => setCount((c) => Math.min(remaining, c + 1))}
              disabled={count >= remaining || remaining <= 0}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold transition-colors disabled:opacity-30"
            >+</button>
          </div>
          <input
            type="range"
            min={1}
            max={Math.max(1, remaining)}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full mt-3 accent-purple-500"
          />
        </div>

        {/* Cost summary */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-300 text-sm">Total cost</span>
            <span className="text-xl font-bold text-purple-300">
              {formatEther(totalCost)} ETH
            </span>
          </div>
        </div>

        {/* CTA area */}
        {!isConnected ? (
          <p className="text-center text-gray-500 text-sm py-2">
            Connect your wallet to buy tickets
          </p>
        ) : !isOpen ? (
          <div className="text-center text-yellow-400 text-sm py-2">
            🎲 Drawing in progress — lottery is currently closed
          </div>
        ) : isPaused ? (
          <div className="text-center text-red-400 text-sm py-2">
            ⚠️ Lottery is paused by admin
          </div>
        ) : remaining <= 0 ? (
          <div className="text-center text-gray-500 text-sm py-2">
            You've used all 10 tickets for this round
          </div>
        ) : (
          <button
            onClick={handleBuy}
            disabled={!canBuy}
            className="w-full py-3 px-6 rounded-xl font-semibold text-white
              bg-gradient-to-r from-purple-600 to-pink-600
              hover:from-purple-500 hover:to-pink-500
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200 active:scale-95"
          >
            {isPending   ? "Confirm in wallet..."   :
             isConfirming ? "Confirming transaction..." :
             `Buy ${count} Ticket${count > 1 ? "s" : ""}`}
          </button>
        )}

        {/* Tx feedback */}
        {isSuccess && (
          <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 text-sm text-center">
            ✅ Tickets purchased! Good luck! 🍀
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm break-all">
            ❌ {(error as Error).message?.split("\n")[0] ?? "Transaction failed"}
          </div>
        )}
        {txHash && !isSuccess && !isConfirming && (
          <div className="p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-300 text-xs font-mono break-all">
            Tx: {txHash}
          </div>
        )}
      </div>
    </div>
  );
}
