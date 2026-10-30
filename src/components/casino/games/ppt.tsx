"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Play, Scissors, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

type Figure = "piedra" | "papel" | "tijera";

const FIGURES: { id: Figure; emoji: string; beats: string }[] = [
  { id: "piedra", emoji: "🪨", beats: "tijera" },
  { id: "papel", emoji: "📄", beats: "piedra" },
  { id: "tijera", emoji: "✂️", beats: "papel" },
];

const LABELS: Record<Figure, string> = { piedra: "Piedra", papel: "Papel", tijera: "Tijera" };

/** PIEDRA, PAPEL O TIJERA — gana ×2,9, empate devuelve */
export function PptGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "ppt"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [pick, setPick] = useState<Figure | null>(null);
  const [house, setHouse] = useState<Figure | null>(null);
  const [last, setLast] = useState<{ outcome: string; profit: number } | null>(null);
  const shakeRef = useRef(0);

  const disabled = busy || !user;

  async function handlePlay(fig: Figure) {
    setPick(fig);
    setBusy(true);
    setLast(null);
    setHouse(null);
    setShaking(true);

    const [res] = await Promise.all([play("ppt", fig, amount), delay(1500)]);
    if (!res.ok) {
      setShaking(false);
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const r = res.data;
    const h = String(r.result.house) as Figure;
    setHouse(h);
    await delay(500);
    setShaking(false);
    setLast({ outcome: r.outcome, profit: r.profit });
    toastResult(r.outcome, r.profit);
    setBusy(false);
  }

  const won = last?.outcome === "win";
  const draw = last?.outcome === "draw";
  const lost = last?.outcome === "lose";

  const resultText = won
    ? `¡Ganaste ${fmtUSD(last?.profit ?? 0)}!`
    : lost
      ? "La casa gana esta ronda"
      : draw
        ? "Empate: apuesta devuelta"
        : "";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {FIGURES.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={disabled}
              onClick={() => void handlePlay(f.id)}
              className={`casino-card p-4 sm:p-6 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                pick === f.id
                  ? "border-gold ring-2 ring-gold/60 bg-gold/5"
                  : "hover:border-gold/40 hover:bg-accent/40"
              }`}
              aria-label={`Jugar ${LABELS[f.id]}`}
            >
              <span className="block text-4xl sm:text-5xl" role="img" aria-hidden>
                {f.emoji}
              </span>
              <span className="mt-2 block font-extrabold uppercase tracking-wide">{LABELS[f.id]}</span>
            </button>
          ))}
        </div>

        {/* Arena */}
        <div
          className={`casino-card flex flex-col items-center justify-center py-8 min-h-48 transition-colors ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          <div className="flex items-center gap-6 sm:gap-12">
            {/* Jugador */}
            <div className="text-center">
              <motion.span
                animate={shaking ? { rotate: [0, -18, 0, 18, 0] } : { rotate: 0 }}
                transition={shaking ? { repeat: Infinity, duration: 0.5 } : { duration: 0.2 }}
                className="block text-5xl sm:text-6xl"
                role="img"
                aria-label="Tu figura"
              >
                {pick ? FIGURES.find((f) => f.id === pick)?.emoji : "❔"}
              </motion.span>
              <span className="mt-2 block text-xs font-bold uppercase text-muted-foreground">Tú</span>
            </div>
            <span className="text-2xl font-black text-muted-foreground/50">VS</span>
            {/* Casa */}
            <div className="text-center">
              <motion.span
                animate={shaking ? { rotate: [0, 18, 0, -18, 0] } : { rotate: 0 }}
                transition={shaking ? { repeat: Infinity, duration: 0.5 } : { duration: 0.2 }}
                className="block text-5xl sm:text-6xl"
                role="img"
                aria-label="Figura de la casa"
              >
                {house ? FIGURES.find((f) => f.id === house)?.emoji : "❔"}
              </motion.span>
              <span className="mt-2 block text-xs font-bold uppercase text-muted-foreground">Casa</span>
            </div>
          </div>
          {resultText && !shaking && (
            <motion.p
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`mt-5 text-lg font-extrabold ${won ? "text-win" : lost ? "text-lose" : "text-foreground"}`}
            >
              {resultText}
            </motion.p>
          )}
          {shaking && <p className="mt-5 text-xs text-muted-foreground animate-pulse">¡Piedra, papel… tijera!</p>}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="casino-card p-4 space-y-4">
          <BetInput
            value={amount}
            onChange={setAmount}
            min={min}
            max={max}
            balance={user?.balance ?? 0}
            disabled={disabled}
            label="Importe por ronda"
          />
          <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-1.5 font-bold text-foreground">
              <ScrollText className="size-3.5" aria-hidden /> Reglas
            </p>
            <p>🪨 aplasta ✂️ · ✂️ corta 📄 · 📄 envuelve 🪨</p>
            <p>
              Ganar paga <strong className="text-gold">×2,9</strong> · Empate devuelve tu apuesta.
            </p>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Scissors className="size-3.5" aria-hidden /> Elige una figura y la casa saca la suya al
            instante.
          </p>
        </div>
        {!busy && pick && (
          <Button variant="secondary" className="w-full" onClick={() => { setPick(null); setHouse(null); setLast(null); }}>
            <Play className="size-4" aria-hidden /> Jugar otra ronda
          </Button>
        )}
      </aside>
    </div>
  );
}
