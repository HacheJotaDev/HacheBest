"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCasino } from "@/store/casino";
import { GAME_NAMES, fmtUSD } from "@/lib/client";
import { ParImparGame } from "./games/parimpar";
import { ExactoGame } from "./games/exacto";
import { MonedaGame } from "./games/moneda";
import { DadoGame } from "./games/dado";
import { TictactoeGame } from "./games/tictactoe";
import { PptGame } from "./games/ppt";

/** Panel del juego activo con cabecera y límites */
export function GamePanel() {
  const activeGame = useCasino((s) => s.activeGame);
  const setActiveGame = useCasino((s) => s.setActiveGame);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === activeGame));

  if (!activeGame) return null;

  const renderGame = () => {
    switch (activeGame) {
      case "parimpar":
        return <ParImparGame />;
      case "exacto":
        return <ExactoGame />;
      case "moneda":
        return <MonedaGame />;
      case "dado":
        return <DadoGame />;
      case "tictactoe":
        return <TictactoeGame />;
      case "ppt":
        return <PptGame />;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => setActiveGame(null)}
        >
          <ArrowLeft className="size-4" aria-hidden /> Volver al lobby
        </Button>
        <h2 className="text-2xl font-extrabold tracking-tight">
          {GAME_NAMES[activeGame] ?? activeGame}
        </h2>
        {cfg && (
          <Badge variant="outline" className="border-gold/40 text-gold">
            {fmtUSD(cfg.minBet)} – {fmtUSD(cfg.maxBet)}
          </Badge>
        )}
      </div>
      {cfg && !cfg.enabled ? (
        <div className="casino-card p-10 text-center text-muted-foreground">
          Este juego está en mantenimiento. Vuelve más tarde.
        </div>
      ) : (
        renderGame()
      )}
    </div>
  );
}
