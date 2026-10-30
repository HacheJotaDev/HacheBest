"use client";

import { useEffect } from "react";
import { History, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useCasino } from "@/store/casino";
import { GAME_NAMES, fmtSign, fmtTime, fmtUSD } from "@/lib/client";

/** Historial completo de apuestas del usuario */
export function HistoryView() {
  const bets = useCasino((s) => s.bets);
  const refreshBets = useCasino((s) => s.refreshBets);
  const user = useCasino((s) => s.user);

  useEffect(() => {
    void refreshBets();
  }, [refreshBets, user?.id]);

  const totals = bets.reduce(
    (acc, b) => {
      acc.profit += b.profit;
      if (b.outcome === "win") acc.wins += 1;
      else if (b.outcome === "lose") acc.losses += 1;
      return acc;
    },
    { profit: 0, wins: 0, losses: 0 },
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <History className="size-6 text-gold" aria-hidden /> Historial de apuestas
          </h2>
          <p className="text-sm text-muted-foreground">Tus últimas {bets.length} apuestas</p>
        </div>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void refreshBets()}>
          <RefreshCw className="size-4" aria-hidden /> Actualizar
        </Button>
      </div>

      {bets.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3 max-w-md">
          <div className="casino-card p-3 text-center">
            <p className="text-[10px] uppercase text-muted-foreground">Balance</p>
            <p className={`font-bold tabular ${totals.profit >= 0 ? "text-win" : "text-lose"}`}>
              {fmtSign(totals.profit)}
            </p>
          </div>
          <div className="casino-card p-3 text-center">
            <p className="text-[10px] uppercase text-muted-foreground">Ganadas</p>
            <p className="font-bold tabular text-win">{totals.wins}</p>
          </div>
          <div className="casino-card p-3 text-center">
            <p className="text-[10px] uppercase text-muted-foreground">Perdidas</p>
            <p className="font-bold tabular text-lose">{totals.losses}</p>
          </div>
        </div>
      )}

      <div className="casino-card overflow-hidden">
        {bets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
            <History className="size-10 opacity-40" aria-hidden />
            <p>Aún no has hecho ninguna apuesta. ¡Ve al casino!</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Juego</TableHead>
                  <TableHead>Apuesta</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead className="text-center">Mult.</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead className="text-right">Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bets.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{GAME_NAMES[b.game] ?? b.game}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {betTypeLabel(b.game, b.betType, b.resultJson)}
                    </TableCell>
                    <TableCell className="text-right tabular">{fmtUSD(b.amount)}</TableCell>
                    <TableCell className="text-center tabular text-muted-foreground">
                      {b.multiplier > 0 ? `×${b.multiplier.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex items-center gap-1 font-bold tabular ${
                          b.outcome === "win" ? "text-win" : b.outcome === "lose" ? "text-lose" : "text-foreground"
                        }`}
                      >
                        {b.outcome === "win" ? (
                          <TrendingUp className="size-3.5" aria-hidden />
                        ) : b.outcome === "lose" ? (
                          <TrendingDown className="size-3.5" aria-hidden />
                        ) : null}
                        {fmtSign(b.profit)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {fmtTime(b.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

function betTypeLabel(game: string, betType: string, resultJson: string): string {
  let result: Record<string, unknown> = {};
  try {
    result = JSON.parse(resultJson) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  switch (game) {
    case "parimpar":
      return betType === "par" ? "Par" : "Impar";
    case "moneda":
      return betType === "cara" ? "Cara" : "Cruz";
    case "dado":
      return `${betType === "mayor" ? "Mayor" : "Menor"} que ${result.target ?? "?"}`;
    case "ppt":
      return betType.charAt(0).toUpperCase() + betType.slice(1);
    case "tictactoe":
      return result.winner === "X" ? "Victoria" : result.winner === "O" ? "Derrota" : "Empate";
    case "exacto":
      return `Nº ${result.picked ?? "?"}`;
    default:
      return betType;
  }
}
