"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, Grid3x3, Loader2, RotateCcw, User, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

type Cell = "X" | "O" | "";
type Phase = "idle" | "playing" | "finished";

/** 3 EN RAYA contra la IA de la casa (todo server-side) — ganar paga ×2,5 · empate devuelve */
export function TictactoeGame() {
  const user = useCasino((s) => s.user);
  const tttStart = useCasino((s) => s.tttStart);
  const tttMove = useCasino((s) => s.tttMove);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "tictactoe"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;
  const winMultiplier = (() => {
    try {
      return Number(JSON.parse(cfg?.configJson ?? "{}").winMultiplier ?? 2.5);
    } catch {
      return 2.5;
    }
  })();

  const [phase, setPhase] = useState<Phase>("idle");
  const [amount, setAmount] = useState(10);
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(""));
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ outcome: string; profit: number } | null>(null);
  const [betId, setBetId] = useState<string | null>(null);

  const disabled = busy || !user;

  async function startMatch() {
    setBusy(true);
    const res = await tttStart(amount);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setBetId(res.data.betId);
    setBoard(Array(9).fill(""));
    setWinLine(null);
    setLast(null);
    setPhase("playing");
    toast.info(`Partida iniciada: ${fmtUSD(amount)} en juego. ¡Tú mueves primero (X)!`);
  }

  async function handleCell(i: number) {
    if (phase !== "playing" || busy || !betId || board[i] !== "") return;
    setBusy(true);
    // X optimista mientras responde el servidor
    setBoard(board.map((c, idx) => (idx === i ? "X" : c)));

    const res = await tttMove(betId, i);
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    setBoard(res.data.board as Cell[]);
    setBusy(false);
    if (res.data.settled) {
      setWinLine(res.data.winLine ?? null);
      setLast({ outcome: res.data.outcome ?? "draw", profit: res.data.profit ?? 0 });
      setPhase("finished");
      toastResult(res.data.outcome ?? "draw", res.data.profit ?? 0);
    }
  }

  const won = last?.outcome === "win";
  const draw = last?.outcome === "draw";
  const lost = last?.outcome === "lose";

  const status = (() => {
    if (phase === "idle") return "Configura tu apuesta y empieza la partida.";
    if (phase === "finished") {
      if (won) return `¡Ganaste ${fmtUSD(last?.profit ?? 0)}!`;
      if (draw) return "Empate: tu apuesta ha sido devuelta.";
      if (lost) return "La casa ganó esta partida. ¡Revancha!";
      return "";
    }
    if (busy) return "La IA está pensando…";
    return "Tu turno: coloca una X.";
  })();

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {/* Tablero */}
        <div
          className={`casino-card p-4 sm:p-6 transition-colors ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
        >
          <div className="mx-auto grid max-w-sm grid-cols-3 gap-2">
            {board.map((cell, i) => (
              <motion.button
                key={i}
                type="button"
                whileHover={cell === "" && phase === "playing" ? { scale: 1.04 } : {}}
                whileTap={cell === "" && phase === "playing" ? { scale: 0.96 } : {}}
                disabled={phase !== "playing" || cell !== "" || disabled}
                onClick={() => void handleCell(i)}
                className={`
                  grid aspect-square place-items-center rounded-xl border-2 text-4xl sm:text-5xl font-black transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${cell === "X" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : ""}
                  ${cell === "O" ? "border-red-500/50 bg-red-500/10 text-red-400" : ""}
                  ${cell === "" ? "border-border/60 bg-background/50" : ""}
                  ${winLine?.includes(i) ? "ring-2 ring-gold border-gold/70" : ""}
                  ${cell === "" && phase === "playing" && !busy ? "hover:border-gold/50 cursor-pointer" : "cursor-default"}
                `}
                aria-label={`Casilla ${i + 1}${cell ? `: ${cell}` : ", vacía"}`}
              >
                {cell === "X" && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>✕</motion.span>}
                {cell === "O" && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>◯</motion.span>}
              </motion.button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-bold text-emerald-400">
              <User className="size-3.5" aria-hidden /> Tú (✕)
            </span>
            <span className="flex items-center gap-1.5 font-bold text-red-400">
              <Bot className="size-3.5" aria-hidden /> La casa (◯)
            </span>
          </div>
        </div>

        {/* Estado */}
        <div
          className={`casino-card flex items-center justify-center gap-2 py-4 text-sm font-bold ${
            won ? "text-win" : draw ? "text-foreground" : lost ? "text-lose" : "text-muted-foreground"
          }`}
          aria-live="polite"
        >
          {busy && phase === "playing" && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {status}
        </div>
      </div>

      <aside className="space-y-4">
        {phase === "idle" && (
          <div className="casino-card p-4 space-y-4">
            <BetInput
              value={amount}
              onChange={setAmount}
              min={min}
              max={max}
              balance={user?.balance ?? 0}
              disabled={disabled}
              label="Apuesta por partida"
            />
            <Button
              className="w-full h-12 font-extrabold text-base"
              disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
              onClick={() => void startMatch()}
            >
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Zap className="size-5" aria-hidden />}
              {busy ? "Iniciando…" : "Empezar partida"}
            </Button>
            <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1.5 font-bold text-foreground">
                <Grid3x3 className="size-3.5" aria-hidden /> Premios
              </p>
              <p>
                Victoria: <strong className="text-gold">×{winMultiplier.toFixed(2)}</strong> tu apuesta.
              </p>
              <p>Empate: se devuelve tu importe. Derrota: pierdes la apuesta.</p>
              <p className="pt-1 text-[11px]">La IA juega en el servidor: nada de trampas 😏</p>
            </div>
          </div>
        )}

        {phase === "playing" && (
          <div className="casino-card p-4 space-y-3">
            <p className="text-sm font-bold">Partida en curso</p>
            <p className="text-xs text-muted-foreground">
              {fmtUSD(amount)} en juego. Si abandonas y empiezas otra partida, esta se reembolsa
              automáticamente.
            </p>
          </div>
        )}

        {phase === "finished" && (
          <div className="casino-card p-4 space-y-4">
            <div
              className={`rounded-lg border p-3 text-center font-bold ${
                won ? "border-win/40 bg-win/10 text-win" : draw ? "border-border bg-background/50" : "border-lose/40 bg-lose/10 text-lose"
              }`}
            >
              {won && `+${fmtUSD(last?.profit ?? 0)}`}
              {draw && "Apuesta devuelta"}
              {lost && `-${fmtUSD(amount)}`}
            </div>
            <Button
              className="w-full h-12 font-extrabold"
              onClick={() => {
                setPhase("idle");
                setBoard(Array(9).fill(""));
                setLast(null);
                setWinLine(null);
                setBetId(null);
              }}
            >
              <RotateCcw className="size-5" aria-hidden /> Nueva partida
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
