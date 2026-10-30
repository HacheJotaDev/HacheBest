"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Gift, Loader2, RotateCcw, ScrollText, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────
// RASCA Y GANA — tarjeta 3×3. Tres símbolos iguales pagan según
// la tabla (🍋 ×1,5 · 🔔 ×3 · ⭐ ×5 · 💎 ×10 · 7️⃣ ×20).
// Ventaja de la casa ≈ 8 %: nada regalado.
// ─────────────────────────────────────────────────────────────

const PAYTABLE = [
  { symbol: "🍋", mult: "×1,5" },
  { symbol: "🔔", mult: "×3" },
  { symbol: "⭐", mult: "×5" },
  { symbol: "💎", mult: "×10" },
  { symbol: "7️⃣", mult: "×20" },
];

interface RascaResult {
  cells: string[];
  prize: string | null;
  multiplier: number;
}

type Phase = "idle" | "raspando" | "done";

/** RASCA Y GANA — compra la tarjeta y raspa las 9 casillas */
export function RascaGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "rasca"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [cells, setCells] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [last, setLast] = useState<{ outcome: string; profit: number; multiplier: number } | null>(
    null,
  );

  const disabled = busy || !user;

  async function comprar() {
    if (disabled || amount > (user?.balance ?? 0) || amount < min) return;
    setBusy(true);
    setLast(null);
    setCells([]);
    setRevealed([]);

    const [res] = await Promise.all([play("rasca", "raspar", amount), delay(600)]);
    if (!res.ok) {
      toast.error(res.error);
      setBusy(false);
      return;
    }
    const r = res.data.result as unknown as RascaResult;
    setCells(r.cells);
    setLast({ outcome: res.data.outcome, profit: res.data.profit, multiplier: res.data.multiplier });
    setPhase("raspando");
    setBusy(false);
  }

  function finish(l: { outcome: string; profit: number } | null) {
    setPhase("done");
    if (l) toastResult(l.outcome, l.profit);
  }

  function reveal(i: number) {
    if (phase !== "raspando" || revealed.includes(i)) return;
    const next = [...revealed, i];
    setRevealed(next);
    if (next.length === 9) finish(last);
  }

  async function revealAll() {
    if (phase !== "raspando") return;
    for (let i = 0; i < 9; i++) {
      setRevealed((prev) => {
        if (prev.includes(i)) return prev;
        return [...prev, i];
      });
      await delay(85);
    }
    finish(last);
  }

  function reset() {
    setPhase("idle");
    setCells([]);
    setRevealed([]);
    setLast(null);
  }

  const won = phase === "done" && last?.outcome === "win";
  const lost = phase === "done" && last?.outcome === "lose";
  const quedan = 9 - revealed.length;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Tarjeta */}
      <div className="space-y-4">
        <div
          className={`casino-card p-4 sm:p-6 ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
        >
          {phase === "idle" ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <span className="grid size-14 place-items-center rounded-2xl border border-gold/30 bg-gold/10">
                <Gift className="size-7 text-gold" aria-hidden />
              </span>
              <p className="text-xl font-extrabold">Rasca y Gana</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Compra tu tarjeta, raspa las 9 casillas y busca tres símbolos iguales. El 7️⃣ paga
                hasta 20 veces tu apuesta.
              </p>
              {busy && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Imprimiendo tarjeta…
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Tarjeta demo · {fmtUSD(amount)}
                </span>
                {phase === "raspando" && (
                  <span className="text-xs font-bold text-gold">Quedan {quedan} casillas</span>
                )}
              </div>
              <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-2.5" role="group" aria-label="Tarjeta de rasca y gana">
                {Array.from({ length: 9 }, (_, i) => {
                  const open = revealed.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => reveal(i)}
                      disabled={phase !== "raspando" || open}
                      aria-label={open ? `Casilla ${i + 1}: ${cells[i] ?? ""}` : `Casilla ${i + 1}: raspa para revelar`}
                      className={`relative grid aspect-square place-items-center overflow-hidden rounded-xl border text-3xl transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-4xl ${
                        open
                          ? "border-border/60 bg-background/80"
                          : "border-gold/40 cursor-pointer hover:border-gold/70 [background:repeating-linear-gradient(45deg,#1a1a1a_0px,#1a1a1a_6px,#242424_6px,#242424_12px)]"
                      }`}
                    >
                      {open ? (
                        <motion.span
                          initial={{ scale: 0.4, opacity: 0, rotate: -25 }}
                          animate={{ scale: 1, opacity: 1, rotate: 0 }}
                          transition={{ type: "spring", bounce: 0.5, duration: 0.4 }}
                          role="img"
                          aria-hidden
                        >
                          {cells[i] ?? "❔"}
                        </motion.span>
                      ) : (
                        <Sparkles className="size-5 text-gold/50" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>

              {phase === "done" && last && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`mt-5 rounded-lg border p-3 text-center font-extrabold ${
                    won ? "border-win/40 bg-win/10 text-win" : "border-lose/40 bg-lose/10 text-lose"
                  }`}
                  aria-live="polite"
                >
                  {won
                    ? `¡Premio! Tres iguales · +${fmtUSD(last.profit)} (×${String(last.multiplier).replace(".", ",")})`
                    : "Sin premio esta vez… ¡casi!"}
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Controles */}
      <aside className="space-y-4">
        <div className="casino-card space-y-4 p-4">
          <BetInput
            value={amount}
            onChange={setAmount}
            min={min}
            max={max}
            balance={user?.balance ?? 0}
            disabled={disabled}
            label="Precio de la tarjeta"
          />

          {phase === "idle" && (
            <Button
              className="h-12 w-full text-base font-extrabold"
              disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
              onClick={() => void comprar()}
            >
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Gift className="size-5" aria-hidden />}
              {busy ? "Imprimiendo…" : "Comprar tarjeta"}
            </Button>
          )}

          {phase === "raspando" && (
            <Button
              className="h-12 w-full bg-gold text-base font-extrabold text-gold-foreground hover:bg-gold/90"
              onClick={() => void revealAll()}
            >
              <Wand2 className="size-5" aria-hidden /> Revelar todo
            </Button>
          )}

          {phase === "done" && (
            <Button className="h-12 w-full font-extrabold" onClick={reset}>
              <RotateCcw className="size-5" aria-hidden /> Nueva tarjeta
            </Button>
          )}

          <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-1.5 font-bold text-foreground">
              <ScrollText className="size-3.5" aria-hidden /> Tabla de premios
            </p>
            <ul className="grid grid-cols-1 gap-1">
              {PAYTABLE.map((p) => (
                <li key={p.symbol} className="flex items-center justify-between">
                  <span className="text-base leading-none">{p.symbol.repeat(3)}</span>
                  <strong className="text-gold">{p.mult}</strong>
                </li>
              ))}
            </ul>
            <p className="pt-1">Tres símbolos iguales cobran el premio. Sin premio, la casa gana.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
