"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Coins, Flame, Loader2, RotateCcw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { toastResult } from "./shared";
import { PlayingCard } from "./playing-card";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

type Guess = "mayorigual" | "menorigual";
type Phase = "idle" | "playing" | "finished";

type MayoMenorState = {
  current: string;
  streak: number;
  runningMult: number;
  deckCount: number;
  nextMults: { mayorigual: number; menorigual: number };
};

const CARD_RE = /^(?:A|2|3|4|5|6|7|8|9|10|J|Q|K)[♠♥♦♣]$/;

function isCard(v: unknown): v is string {
  return typeof v === "string" && CARD_RE.test(v);
}

function fmtMult(n: number): string {
  return n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/** MAYOR O MENOR — cadena de cartas: cada acierto multiplica el premio · retírate cuando quieras */
export function MayorMenorGame() {
  const sessionStart = useCasino((s) => s.sessionStart);
  const sessionAct = useCasino((s) => s.sessionAct);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "mayormenor"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [phase, setPhase] = useState<Phase>("idle");
  const [amount, setAmount] = useState(10);
  const [state, setState] = useState<MayoMenorState | null>(null);
  const [betId, setBetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ outcome: string; profit: number } | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null); // carta siguiente al fallar
  const [lastGuess, setLastGuess] = useState<Guess | null>(null);

  const disabled = busy || !user;
  const won = last?.outcome === "win";
  const lost = last?.outcome === "lose";

  async function startRound() {
    setBusy(true);
    const res = await sessionStart("mayormenor", amount);
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    if (!res.data.state) {
      setBusy(false);
      toast.error("El servidor no devolvió el estado inicial");
      return;
    }
    setBetId(res.data.betId);
    setState(res.data.state as MayoMenorState);
    setLast(null);
    setRevealed(null);
    setLastGuess(null);
    setPhase("playing");
    setBusy(false);
  }

  async function guess(g: Guess) {
    if (!betId) return;
    setBusy(true);
    const res = await sessionAct("mayormenor", betId, "guess", { guess: g });
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    if (res.data.settled) {
      // Fallo: se revela la carta siguiente y la cadena termina
      const next =
        res.data.result && isCard(res.data.result.next) ? res.data.result.next : null;
      const profit = res.data.profit ?? -amount;
      setLastGuess(g);
      setRevealed(next);
      setLast({ outcome: "lose", profit });
      setPhase("finished");
      toastResult("lose", profit);
      setBusy(false);
      return;
    }
    if (res.data.state) setState(res.data.state as MayoMenorState);
    setBusy(false);
  }

  async function cashout() {
    if (!betId) return;
    setBusy(true);
    const res = await sessionAct("mayormenor", betId, "cashout");
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    if (res.data.settled) {
      const profit = res.data.profit ?? 0;
      setLast({ outcome: "win", profit });
      setPhase("finished");
      toastResult("win", profit);
    } else if (res.data.state) {
      setState(res.data.state as MayoMenorState);
    }
    setBusy(false);
  }

  function reset() {
    setPhase("idle");
    setState(null);
    setBetId(null);
    setLast(null);
    setRevealed(null);
    setLastGuess(null);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Zona de juego */}
      <div className="space-y-4">
        {phase === "idle" && (
          <div className="casino-card flex flex-col items-center justify-center gap-4 py-12">
            <PlayingCard size="lg" />
            <p className="text-sm text-muted-foreground">
              Reparte la primera carta para comenzar la cadena
            </p>
          </div>
        )}

        {phase === "playing" && state && (
          <>
            {/* Carta actual y estadísticas */}
            <div className="casino-card space-y-6 p-5 sm:p-6">
              <div className="flex justify-center [perspective:800px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={state.current}
                    initial={{ rotateY: -90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    exit={{ rotateY: 90, opacity: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <PlayingCard card={state.current} size="lg" />
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="flex items-center justify-center gap-6 sm:gap-10">
                <span className="flex items-center gap-1.5 text-sm font-bold text-gold">
                  <Flame className="size-4" aria-hidden /> Racha: {state.streak}
                </span>
                <span className="text-center">
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Multiplicador
                  </span>
                  <motion.span
                    key={state.streak}
                    initial={{ scale: 1.35 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 16 }}
                    className="block text-3xl font-extrabold text-gold tabular"
                    aria-live="polite"
                  >
                    ×{fmtMult(state.runningMult)}
                  </motion.span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Mazo: {state.deckCount} cartas
                </span>
              </div>
            </div>

            {/* Decisiones */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={disabled}
                onClick={() => void guess("mayorigual")}
                aria-label="Mayor o igual"
                className="casino-card p-4 sm:p-5 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-emerald-400/60 hover:bg-emerald-500/5 disabled:pointer-events-none disabled:opacity-50"
              >
                <ArrowUp className="mx-auto size-7 text-emerald-400" aria-hidden />
                <span className="mt-2 block text-base sm:text-lg font-extrabold uppercase tracking-wide">
                  Mayor o igual
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  paga <strong className="text-emerald-400 tabular">×{fmtMult(state.nextMults.mayorigual)}</strong>
                </span>
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void guess("menorigual")}
                aria-label="Menor o igual"
                className="casino-card p-4 sm:p-5 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-red-400/60 hover:bg-red-500/5 disabled:pointer-events-none disabled:opacity-50"
              >
                <ArrowDown className="mx-auto size-7 text-red-400" aria-hidden />
                <span className="mt-2 block text-base sm:text-lg font-extrabold uppercase tracking-wide">
                  Menor o igual
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  paga <strong className="text-red-400 tabular">×{fmtMult(state.nextMults.menorigual)}</strong>
                </span>
              </button>
            </div>

            {/* Retirar */}
            <button
              type="button"
              disabled={disabled || state.streak === 0}
              onClick={() => void cashout()}
              aria-label="Retirar premio"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gold font-extrabold text-gold-foreground transition-colors outline-none hover:bg-gold/90 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Coins className="size-5" aria-hidden />
              )}
              Retirar {fmtUSD(amount * state.runningMult)}
            </button>
          </>
        )}

        {phase === "finished" && state && (
          <div
            className={`casino-card flex min-h-44 flex-col items-center justify-center gap-4 p-6 transition-colors ${
              won ? "border-win/60 bg-win/5" : "border-lose/50 bg-lose/5"
            }`}
            aria-live="polite"
          >
            <div className="flex items-center justify-center gap-4">
              <PlayingCard card={state.current} size="lg" />
              {revealed && (
                <motion.div
                  initial={{ rotateY: 90, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ duration: 0.35, delay: 0.15 }}
                >
                  <PlayingCard card={revealed} size="md" className="rotate-3" />
                </motion.div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {won
                ? `Cadena completada: ${state.streak} aciertos`
                : revealed
                  ? `La carta siguiente era ${revealed}`
                  : "Cadena terminada"}
            </p>
          </div>
        )}
      </div>

      {/* Controles de apuesta */}
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
              label="Apuesta inicial"
            />
            <Button
              className="w-full h-12 font-extrabold text-base"
              disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
              onClick={() => void startRound()}
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Zap className="size-5" aria-hidden />
              )}
              {busy ? "Repartiendo…" : "Repartir primera carta"}
            </Button>
            <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-bold text-foreground">Cómo se juega</p>
              <p>
                Acierta si la siguiente carta es Mayor o igual / Menor o igual. Cada acierto
                multiplica tu premio. Retírate cuando quieras.
              </p>
            </div>
          </div>
        )}

        {phase === "playing" && state && (
          <div className="casino-card p-4 space-y-3">
            <p className="text-sm font-bold">Cadena en curso</p>
            <p className="text-xs text-muted-foreground">
              {fmtUSD(amount)} en juego. Si aciertas, el multiplicador sube; si fallas, lo pierdes
              todo.
            </p>
            <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground space-y-1">
              <p>
                Premio actual si te retiras:{" "}
                <strong className="text-gold">{fmtUSD(amount * state.runningMult)}</strong>
              </p>
              <p>El As es la carta más baja. Que salga la misma carta también gana.</p>
            </div>
          </div>
        )}

        {phase === "finished" && (
          <div className="casino-card p-4 space-y-4">
            <div
              className={`rounded-lg border p-3 text-center font-bold ${
                won ? "border-win/40 bg-win/10 text-win" : "border-lose/40 bg-lose/10 text-lose"
              }`}
            >
              {won && `+${fmtUSD(last?.profit ?? 0)} retirado`}
              {lost &&
                `La ${revealed ?? "?"} no era ${
                  lastGuess === "mayorigual"
                    ? "mayor o igual"
                    : lastGuess === "menorigual"
                      ? "menor o igual"
                      : "lo esperado"
                }… -${fmtUSD(amount)}`}
            </div>
            <Button className="w-full h-12 font-extrabold" onClick={reset}>
              <RotateCcw className="size-5" aria-hidden /> Nueva cadena
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
