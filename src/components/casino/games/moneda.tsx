"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Coins, Cross, Crown, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

type Pick = "cara" | "cruz";

/** CARA o CRUZ — moneda al aire que paga ×1,9 */
export function MonedaGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "moneda"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<Pick | null>(null);
  const [last, setLast] = useState<{ outcome: string; profit: number } | null>(null);

  const disabled = busy || !user;

  async function handlePlay() {
    if (!pick) {
      toast.error("Elige CARA o CRUZ antes de apostar");
      return;
    }
    setBusy(true);
    setLast(null);
    setFlipping(true);
    setResult(null);
    const [res] = await Promise.all([play("moneda", pick, amount), delay(1600)]);
    if (!res.ok) {
      setFlipping(false);
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const r = res.data;
    const side = String(r.result.side) as Pick;
    setResult(side);
    // La moneda desacelera y muestra el lado ganador
    await delay(600);
    setFlipping(false);
    setLast({ outcome: r.outcome, profit: r.profit });
    toastResult(r.outcome, r.profit);
    setBusy(false);
  }

  const won = last?.outcome === "win";
  const lost = last?.outcome === "lose";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {(["cara", "cruz"] as Pick[]).map((p) => (
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
              {p === "cara" ? (
                <Crown className="mx-auto size-7 text-gold" aria-hidden />
              ) : (
                <Cross className="mx-auto size-7 text-emerald-400" aria-hidden />
              )}
              <span className="mt-2 block text-xl sm:text-2xl font-extrabold uppercase tracking-wide">
                {p}
              </span>
            </button>
          ))}
        </div>

        {/* Moneda */}
        <div
          className={`casino-card flex flex-col items-center justify-center py-10 min-h-52 transition-colors ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          <div className="[perspective:800px]">
            <motion.div
              animate={
                flipping
                  ? { rotateY: 1440 + (result === "cruz" ? 180 : 0), y: [0, -26, 0] }
                  : { rotateY: result === "cruz" ? 180 : 0, y: 0 }
              }
              transition={
                flipping
                  ? { duration: 1.5, ease: "easeOut" }
                  : { type: "spring", stiffness: 200, damping: 18 }
              }
              className="relative size-28 sm:size-32 [transform-style:preserve-3d]"
            >
              {/* CARA */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300 via-gold to-amber-600 border-4 border-amber-700 shadow-xl shadow-amber-500/20 grid place-items-center [backface-visibility:hidden]">
                <Crown className="size-12 text-amber-900" aria-hidden />
              </div>
              {/* CRUZ (lado trasero) */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 via-gold to-amber-700 border-4 border-amber-800 shadow-xl shadow-amber-500/20 grid place-items-center [transform:rotateY(180deg)] [backface-visibility:hidden]">
                <Cross className="size-12 text-amber-950" aria-hidden />
              </div>
            </motion.div>
          </div>

          <p className="mt-5 text-sm font-bold uppercase tracking-widest text-muted-foreground" aria-live="polite">
            {flipping ? "La moneda está en el aire…" : result ? `Salió: ${result}` : pick ? `Apuestas a ${pick}` : "Elige un lado"}
          </p>
          {last && !flipping && (
            <p className={`mt-1 text-lg font-extrabold ${won ? "text-win" : lost ? "text-lose" : ""}`}>
              {won && `¡Ganaste ${fmtUSD(last.profit)}!`}
              {lost && "Suerte en la próxima"}
            </p>
          )}
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
          />
          <Button
            className="w-full h-12 font-extrabold text-base"
            disabled={disabled || !pick || amount > (user?.balance ?? 0) || amount < min}
            onClick={() => void handlePlay()}
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Coins className="size-5" aria-hidden />}
            {busy ? "Lanzando…" : "Lanzar moneda"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Acertar el lado pag <strong className="text-gold">×1,9</strong> tu apuesta.
          </p>
        </div>
      </aside>
    </div>
  );
}
