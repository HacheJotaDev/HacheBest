"use client";

import { useEffect } from "react";
import { Dices, Loader2 } from "lucide-react";
import { Header } from "@/components/casino/header";
import { Footer } from "@/components/casino/footer";
import { LoginHero } from "@/components/casino/login-hero";
import { Lobby } from "@/components/casino/lobby";
import { GamePanel } from "@/components/casino/game-panel";
import { HistoryView } from "@/components/casino/history-view";
import { RankingView } from "@/components/casino/ranking-view";
import { useCasino } from "@/store/casino";

export default function Home() {
  const hydrated = useCasino((s) => s.hydrated);
  const user = useCasino((s) => s.user);
  const view = useCasino((s) => s.view);
  const activeGame = useCasino((s) => s.activeGame);

  useEffect(() => {
    void useCasino.getState().hydrate();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {!hydrated ? (
          <Splash />
        ) : !user ? (
          <LoginHero />
        ) : view === "casino" ? (
          activeGame ? <GamePanel /> : <Lobby />
        ) : view === "historial" ? (
          <HistoryView />
        ) : (
          <RankingView />
        )}
      </main>

      <Footer />
    </div>
  );
}

function Splash() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-32 text-muted-foreground">
      <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-gold to-amber-600 shadow-xl shadow-amber-500/20">
        <Dices className="size-8 text-amber-950" aria-hidden />
      </span>
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Cargando HacheBest…
      </div>
    </div>
  );
}
