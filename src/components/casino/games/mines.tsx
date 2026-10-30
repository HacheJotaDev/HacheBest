"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bomb, Coins, Gem, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────
// Mines (juego de sesión): revela gemas, esquiva minas y retírate
// ─────────────────────────────────────────────────────────────

type Phase = "idle" | "playing" | "finished";

/** Estado público que envía el servidor (publicMines) */
interface MinesState {
  minesCount: number;
  revealed: number[];
  currentMult: number;
  nextMult: number | null;
  remainingSafe: number;
  gridSize: number;
}

/** resultJson de la liquidación */
type MinesResult = {
  hitTile?: number;
  mines?: number[];
  revealed?: number[];
  reason?: string;
};

interface Boom {
  mines: number[];
  hitTile: number | null;
}

interface LastRound {
  outcome: "win" | "lose";
  profit: number;
  multiplier: number;
}

const MINE_OPTIONS = [1, 3, 5, 10, 15, 24] as const;

// debe coincidir con src/lib/games-session.ts
function minesMult(mines: number, picks: number): number {
  if (picks <= 0) return 1;
  let m = 1;
  for (let i = 0; i < picks; i++) m *= (25 - i) / (25 - mines - i);
  return Math.round(m * 0.99 * 100) / 100;
}

function fmtX(n: number): string {
  return `×${n.toFixed(2).replace(".", ",")}`;
}

/** MINES — cuadrícula 5×5: cada gema sube el multiplicador, una mina lo pierde todo */
export function MinesGame() {
  const sessionStart = useCasino((s) => s.sessionStart);
  const sessionAct = useCasino((s) => s.sessionAct);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "mines"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [phase, setPhase] = useState<Phase>("idle");
  const [amount, setAmount] = useState(10);
  const [mines, setMines] = useState(3);
  const [betId, setBetId] = useState<string | null>(null);
  const [state, setState] = useState<MinesState | null>(null);
  const [boom, setBoom] = useState<Boom | null>(null);
  const [last, setLast] = useState<LastRound | null>(null);
  const [busy, setBusy] = useState(false);

  const disabled = busy || !user;

  async function start() {
    setBusy(true);
    setBoom(null);
    setLast(null);
    const res = await sessionStart("mines", amount, { mines });
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const st = res.data.state as unknown as MinesState | undefined;
    if (!st) {
      setBusy(false);
      toast.error("No se pudo empezar la ronda");
      return;
    }
    setBetId(res.data.betId);
    setState(st);
    setPhase("playing");
    setBusy(false);
  }

  function finishWith(result: MinesResult, outcome: "win" | "lose", profit: number, multiplier: number) {
    setBoom({
      mines: result.mines ?? [],
      hitTile: outcome === "lose" && typeof result.hitTile === "number" ? result.hitTile : null,
    });
    setLast({ outcome, profit, multiplier });
    setPhase("finished");
    toastResult(outcome, profit);
  }

  async function reveal(tile: number) {
    if (phase !== "playing" || busy || !betId || !state) return;
    if (state.revealed.includes(tile)) return;
    setBusy(true);
    const res = await sessionAct("mines", betId, "reveal", { tile });
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    if (res.data.settled) {
      const outcome = res.data.outcome === "win" ? "win" : "lose";
      const result = (res.data.result ?? {}) as MinesResult;
      finishWith(
        result,
        outcome,
        outcome === "win" ? (res.data.profit ?? 0) : (res.data.profit ?? -amount),
        outcome === "win" ? (res.data.multiplier ?? 0) : 0,
      );
    } else if (res.data.state) {
      setState(res.data.state as unknown as MinesState);
    }
    setBusy(false);
  }

  async function cashout() {
    if (phase !== "playing" || busy || !betId || !state || state.revealed.length === 0) return;
    setBusy(true);
    const res = await sessionAct("mines", betId, "cashout");
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    if (res.data.settled && res.data.outcome === "win") {
      const result = (res.data.result ?? {}) as MinesResult;
      finishWith(result, "win", res.data.profit ?? 0, res.data.multiplier ?? 0);
    }
    setBusy(false);
  }

  function reset() {
    setPhase("idle");
    setState(null);
    setBoom(null);
    setLast(null);
    setBetId(null);
  }

  const shownRevealed = state?.revealed ?? [];
  const shownMines = phase === "finished" && boom ? boom.mines : [];
  const shake = phase === "finished" && boom?.hitTile != null;

  function cellClasses(i: number): string {
    if (shownMines.includes(i)) {
      if (boom?.hitTile === i) return "border-red-500/40 bg-red-500/10 text-red-400 ring-2 ring-red-500";
      return boom?.hitTile != null
        ? "border-red-500/40 bg-red-500/10 text-red-400"
        : "border-red-500/20 bg-red-500/5 text-red-400/50";
    }
    if (shownRevealed.includes(i)) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    return "border-border/60 bg-zinc-800/60";
  }

  const won = last?.outcome === "win";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Tablero */}
      <div className="space-y-4">
        <div
          className={`casino-card p-4 sm:p-6 ${
            phase === "finished" && won
              ? "border-win/60 bg-win/5"
              : phase === "finished" && !won
                ? "border-lose/50 bg-lose/5"
                : ""
          }`}
        >
          <motion.div
            animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
            transition={shake ? { duration: 0.4 } : { duration: 0 }}
            className="mx-auto grid max-w-sm grid-cols-5 gap-2"
          >
            {Array.from({ length: state?.gridSize ?? 25 }, (_, i) => {
              const revealed = shownRevealed.includes(i);
              const isMineShown = shownMines.includes(i);
              const clickable = phase === "playing" && !busy && user !== null && !revealed;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!clickable}
                  onClick={() => void reveal(i)}
                  aria-label={`Casilla ${i + 1}${revealed ? ": gema" : isMineShown ? ": mina" : ", oculta"}`}
                  className={`grid aspect-square place-items-center rounded-lg border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${cellClasses(i)} ${
                    clickable ? "cursor-pointer hover:border-gold/50" : "cursor-default"
                  }`}
                >
                  {revealed ? (
                    <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="grid place-items-center">
                      <Gem className="size-5" aria-hidden />
                    </motion.span>
                  ) : isMineShown ? (
                    <Bomb className="size-5" aria-hidden />
                  ) : (
                    <Gem className="size-5 text-zinc-600" aria-hidden />
                  )}
                </button>
              );
            })}
          </motion.div>
        </div>

        {/* Marcador */}
        {state && phase !== "idle" && (
          <div className="casino-card flex flex-wrap items-center justify-between gap-3 p-3 text-sm" aria-live="polite">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground">Actual</span>
              <span className="font-bold tabular-nums text-gold">{fmtX(state.currentMult)}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground">Siguiente</span>
              <span className="font-semibold tabular-nums text-muted-foreground">
                {state.nextMult !== null ? fmtX(state.nextMult) : "¡Campo completo!"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Gem className="size-4 text-emerald-400" aria-hidden />
              <span>
                <strong className="text-foreground">{state.remainingSafe}</strong> gemas seguras
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Controles de apuesta */}
      <aside className="space-y-4">
        {phase === "idle" && (
          <div className="casino-card space-y-4 p-4">
            <BetInput
              value={amount}
              onChange={setAmount}
              min={min}
              max={max}
              balance={user?.balance ?? 0}
              disabled={disabled}
              label="Apuesta por ronda"
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Minas</span>
                <span className="text-xs text-muted-foreground">1 – 24</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {MINE_OPTIONS.map((n) => (
                  <Button
                    key={n}
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-pressed={mines === n}
                    className={`h-9 border text-xs font-bold ${mines === n ? "border-gold bg-gold/5 text-gold" : "border-transparent"}`}
                    disabled={disabled}
                    onClick={() => setMines(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Con {mines} minas, el primer acierto paga{" "}
                <strong className="text-gold">{fmtX(minesMult(mines, 1))}</strong>.
              </p>
            </div>
            <Button
              className="h-12 w-full text-base font-extrabold"
              disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
              onClick={() => void start()}
            >
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Bomb className="size-5" aria-hidden />}
              {busy ? "Preparando…" : "Empezar ronda"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Cada gema sube el multiplicador. Más minas, más riesgo y más premio: retírate cuando
              quieras para cobrar.
            </p>
          </div>
        )}

        {phase === "playing" && (
          <div className="casino-card space-y-3 p-4">
            <p className="text-sm font-bold">Ronda en curso</p>
            <p className="text-xs text-muted-foreground">
              {fmtUSD(amount)} en juego · {state?.minesCount ?? mines} minas. Si revelas una mina,
              pierdes la ronda.
            </p>
            <Button
              className="h-12 w-full bg-gold text-base font-extrabold text-gold-foreground hover:bg-gold/90"
              disabled={busy || !state || state.revealed.length === 0}
              onClick={() => void cashout()}
            >
              <Coins className="size-5" aria-hidden /> Retirar {fmtUSD(amount * (state?.currentMult ?? 1))}
            </Button>
          </div>
        )}

        {phase === "finished" && last && (
          <div className="casino-card space-y-4 p-4">
            <div
              className={`rounded-lg border p-3 text-center font-bold ${
                won ? "border-win/40 bg-win/10 text-win" : "border-lose/40 bg-lose/10 text-lose"
              }`}
              aria-live="polite"
            >
              {won && `+${fmtUSD(last.profit)} retirado a ${fmtX(last.multiplier)}`}
              {!won && `¡BOOM! Era una mina -${fmtUSD(amount)}`}
            </div>
            <Button className="h-12 w-full font-extrabold" onClick={reset}>
              <RotateCcw className="size-5" aria-hidden /> Nueva ronda
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
