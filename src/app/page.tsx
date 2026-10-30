"use client";

import { useEffect } from "react";
import { Dices, Loader2, ShieldBan, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/casino/header";
import { Footer } from "@/components/casino/footer";
import { Lobby } from "@/components/casino/lobby";
import { GamePanel } from "@/components/casino/game-panel";
import { HistoryView } from "@/components/casino/history-view";
import { RankingView } from "@/components/casino/ranking-view";
import { useCasino } from "@/store/casino";

export default function Home() {
  const hydrated = useCasino((s) => s.hydrated);
  const user = useCasino((s) => s.user);
  const suspendido = useCasino((s) => s.suspendido);
  const view = useCasino((s) => s.view);
  const activeGame = useCasino((s) => s.activeGame);

  useEffect(() => {
    void useCasino.getState().hydrate();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* El proxy solo deja pasar con sesión: mientras el servidor
            confirma el usuario, mostramos la carga. Si la sesión no
            vale, hydrate() manda al login; si está suspendida, avisa. */}
        {!hydrated || (!user && !suspendido) ? (
          <Splash />
        ) : suspendido ? (
          <Suspendido />
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

function Suspendido() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-destructive/15">
        <ShieldBan className="size-8 text-destructive" aria-hidden />
      </span>
      <h2 className="text-2xl font-extrabold">Cuenta suspendida</h2>
      <p className="max-w-md text-muted-foreground">
        El administrador ha suspendido esta cuenta. Si crees que es un error, contacta con el
        responsable del casino.
      </p>
      <Button variant="outline" onClick={() => void useCasino.getState().logout()}>
        <LogOut className="size-4" aria-hidden />
        Cerrar sesión
      </Button>
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
        Abriendo HacheBest…
      </div>
    </div>
  );
}
