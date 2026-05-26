import { Header }       from "@/components/Header";
import { LotteryStats } from "@/components/LotteryStats";
import { BuyTicket }    from "@/components/BuyTicket";
import { AdminPanel }   from "@/components/AdminPanel";
import { DrawHistory }  from "@/components/DrawHistory";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950">
      <Header />

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left / main column */}
          <div className="lg:col-span-2 space-y-6">
            <LotteryStats />
            <BuyTicket />
            <AdminPanel />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <DrawHistory />
          </div>
        </div>
      </div>
    </main>
  );
}
