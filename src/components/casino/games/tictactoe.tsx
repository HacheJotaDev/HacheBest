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

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winnerOf(b: Cell[]): { winner: "X" | "O" | null; line: number[] | null } {
  for (const line of LINES) {
    const [a, c, d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a] as "X" | "O", line };
  }
  return { winner: null, line: null };
}

function findWinningMove(b: Cell[], who: "X" | "O"): number | null {
  for (let i = 0; i < 9; i++) {
    if (b[i] !== "") continue;
    b[i] = who;
    const w = winnerOf(b).winner;
    b[i] = "";
    if (w === who) return i;
  }
  return null;
}

/** IA "humana": gana y bloquea casi siempre, pero es batible */
function aiChoose(board: Cell[]): number {
  const b = [...board];
  const empty = b.map((c, i) => (c === "" ? i : -1)).filter((i) => i >= 0);
  if (empty.length === 0) return -1;

  const winMove = findWinningMove(b, "O");
  if (winMove !== null && Math.random() < 0.9) return winMove;

  const blockMove = findWinningMove(b, "X");
  if (blockMove !== null && Math.random() < 0.78) return blockMove;

  // Elección aleatoria ponderada: centro > esquinas > bordes
  const weighted: number[] = [];
  for (const i of empty) {
    const w = i === 4 ? 3 : [0, 2, 6, 8].includes(i) ? 2 : 1;
    for (let k = 0; k < w; k++) weighted.push(i);
  }
  return weighted[Math.floor(Math.random() * weighted.length)];
}

/** 3 EN RAYA contra la IA — ganar paga ×2,5 · empate devuelve la apuesta */
export function TictactoeGame() {
  const user = useCasino((s) => s.user);
  const tttStart = useCasino((s) => s.tttStart);
  const tttSettle = useCasino((s) => s.tttSettle);
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
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [last, setLast] = useState<{ outcome: string; profit: number } | null>(null);
  const [betId, setBetId] = useState<string | null>(null);

  const disabled = busy || !user;

  async function startMatch() {
    setBusy(true);
    const res = await tttStart(amount);
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    setBetId(res.data.betId);
    setBoard(Array(9).fill(""));
    setTurn("X");
    setWinLine(null);
    setLast(null);
    setPhase("playing");
    setBusy(false);
    toast.info(`Partida iniciada: ${fmtUSD(amount)} en juego. ¡Tú mueves primero (X)!`);
  }

  async function settle(finalBoard: Cell[]) {
    if (!betId) return;
    const res = await tttSettle(betId, finalBoard);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setLast({ outcome: res.data.outcome, profit: res.data.profit });
    toastResult(res.data.outcome, res.data.profit);
  }

  function endIfOver(b: Cell[]) {
    const { winner, line } = winnerOf(b);
    const full = b.every((c) => c !== "");
    if (winner || full) {
      setWinLine(line);
      setPhase("finished");
      void settle(b);
      return true;
    }
    return false;
  }

  async function handleCell(i: number) {
    if (phase !== "playing" || busy || aiThinking || board[i] !== "") return;
    const afterPlayer: Cell[] = board.map((c, idx) => (idx === i ? "X" : c));
    setBoard(afterPlayer);
    if (endIfOver(afterPlayer)) return;

    // Turno de la IA
    setAiThinking(true);
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));
    const move = aiChoose(afterPlayer);
    const afterAi: Cell[] =
      move >= 0 ? afterPlayer.map((c, idx) => (idx === move ? "O" : c)) : afterPlayer;
    setAiThinking(false);
    setBoard(afterAi);
    setTurn("X");
    endIfOver(afterAi);
  }

  const won = last?.outcome === "win";
  const draw = last?.outcome === "draw";
  const lost = last?.outcome === "lose";

  const status = (() => {
    if (phase === "idle") return "Configura tu apuesta y empieza la partida.";
    if (phase === "finished") {
      if (won) return `¡Ganaste ${fmtUSD(last?.profit ?? 0)}!`;
      if (draw) return "Empate: tu apuesta ha sido devuelta.";
      if (lost) return "La IA ganó esta partida. ¡Revancha!";
      return "";
    }
    if (aiThinking) return "La IA está pensando…";
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
                disabled={phase !== "playing" || cell !== "" || disabled || aiThinking}
                onClick={() => void handleCell(i)}
                className={`
                  grid aspect-square place-items-center rounded-xl border-2 text-4xl sm:text-5xl font-black transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${cell === "X" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : ""}
                  ${cell === "O" ? "border-red-500/50 bg-red-500/10 text-red-400" : ""}
                  ${cell === "" ? "border-border/60 bg-background/50" : ""}
                  ${winLine?.includes(i) ? "ring-2 ring-gold border-gold/70" : ""}
                  ${cell === "" && phase === "playing" && !aiThinking ? "hover:border-gold/50 cursor-pointer" : "cursor-default"}
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
              <Bot className="size-3.5" aria-hidden /> IA (◯)
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
          {aiThinking && <Loader2 className="size-4 animate-spin" aria-hidden />}
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
