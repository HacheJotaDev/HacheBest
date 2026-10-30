"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Binary, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

type Pick = "par" | "impar";

/** PAR o IMPAR — número 0-99, el 0 cuenta como par */
export function ParImparGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "parimpar"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [display, setDisplay] = useState<number | null>(null);
  const [last, setLast] = useState<{ outcome: string; profit: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const disabled = busy || !user;

  async function handlePlay() {
    if (!pick) {
      toast.error("Elige PAR o IMPAR antes de apostar");
      return;
    }
    setBusy(true);
    setLast(null);
    setRolling(true);
    intervalRef.current = setInterval(() => {
      setDisplay(Math.floor(Math.random() * 100));
    }, 60);

    const [res] = await Promise.all([play("parimpar", pick, amount), delay(1000)]);

    if (intervalRef.current) clearInterval(intervalRef.current);
    setRolling(false);

    if (!res.ok) {
      setDisplay(null);
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const r = res.data;
    setDisplay(Number(r.result.number));
    setLast({ outcome: r.outcome, profit: r.profit });
    toastResult(r.outcome, r.profit);
    setBusy(false);
  }

  const parity = display === null ? null : display % 2 === 0 ? "par" : "impar";
  const won = last?.outcome === "win";
  const lost = last?.outcome === "lose";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Zona de juego */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {(["par", "impar"] as Pick[]).map((p) => (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => setPick(p)}
              className={`casino-card p-5 sm:p-8 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                pick === p
                  ? "border-gold ring-2 ring-gold/60 bg-gold/5"
                  : "hover:border-gold/40 hover:bg-accent/40"
              }`}
              aria-pressed={pick === p}
            >
              <Binary className={`mx-auto size-7 ${p === "par" ? "text-emerald-400" : "text-gold"}`} aria-hidden />
              <span className="mt-2 block text-xl sm:text-2xl font-extrabold uppercase tracking-wide">
                {p}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {p === "par" ? "0, 2, 4, 6… 98" : "1, 3, 5, 7… 99"}
              </span>
            </button>
          ))}
        </div>

        {/* Visor del número */}
        <div
          className={`casino-card relative flex flex-col items-center justify-center py-10 min-h-44 transition-colors ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          {display === null ? (
            <span className="text-6xl font-extrabold text-muted-foreground/40">?</span>
          ) : (
            <motion.span
              key={`${display}-${rolling}`}
              initial={{ scale: rolling ? 0.9 : 0.6, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={`text-6xl sm:text-7xl font-extrabold tabular ${
                won ? "text-win" : lost ? "text-lose" : "text-foreground"
              }`}
            >
              {display}
            </motion.span>
          )}
          {display !== null && !rolling && (
            <span
              className={`mt-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                parity === "par"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-amber-500/15 text-gold"
              }`}
            >
              {parity}
            </span>
          )}
          {rolling && <span className="mt-2 text-xs text-muted-foreground animate-pulse">Girando…</span>}
          {last && !rolling && (
            <span className={`mt-3 text-sm font-bold ${won ? "text-win" : lost ? "text-lose" : ""}`}>
              {won && `¡Ganaste ${fmtUSD(last.profit)}!`}
              {lost && "Suerte en la próxima"}
            </span>
          )}
        </div>
      </div>

      {/* Controles de apuesta */}
      <aside className="space-y-4">
        <div className="casino-card p-4 space-y-4">
          <BetInput
            value={amount}
            onChange={setAmount}
            min={min}
            max={max}
            balance={user?.balance ?? 0}
            disabled={disabled}
          />
          <Button
            className="w-full h-12 font-extrabold text-base"
            disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
            onClick={() => void handlePlay()}
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5" aria-hidden />}
            {busy ? "Apostando…" : "Apostar"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Si aciertas el resultado con tu elección pag <strong className="text-gold">×1,9</strong>{" "}
            tu apuesta.
          </p>
        </div>
      </aside>
    </div>
  );
}
