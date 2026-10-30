"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FerrisWheel, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

// debe coincidir con src/lib/games.ts
const RUEDA_SEGMENTS = [0, 1.5, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 2, 0, 1.5, 0, 4, 0, 1.5, 0, 2, 0, 1.5, 0, 2, 0, 0];
const SEG = 360 / 26;

// Color de cada segmento según su multiplicador
const MULT_COLOR: Record<number, string> = {
  0: "#27272a",
  1.5: "#047857",
  2: "#10b981",
  3: "#f59e0b",
  5: "#fbbf24",
};

const MULT_CHIP: Record<number, string> = {
  0: "bg-zinc-700 text-white",
  1.5: "bg-emerald-700 text-white",
  2: "bg-emerald-500 text-white",
  3: "bg-amber-500 text-zinc-950",
  5: "bg-gold text-zinc-950",
};

// Fondo de la rueda: 26 sectores como conic-gradient (se construye una sola vez)
const RUEDA_BG = `conic-gradient(${RUEDA_SEGMENTS.map((m, i) => {
  const a1 = i * SEG;
  const a2 = (i + 1) * SEG;
  return `${MULT_COLOR[m] ?? "#27272a"} ${a1}deg ${a2}deg`;
}).join(", ")})`;

const fmtMult = (m: number) => `×${String(m).replace(".", ",")}`;

const LEYENDA: { m: number; label: string }[] = [
  { m: 0, label: "Quiebra" },
  { m: 1.5, label: "×1,5" },
  { m: 2, label: "×2" },
  { m: 3, label: "×3" },
  { m: 5, label: "×5" },
];

/** RUEDA DE LA FORTUNA — 26 segmentos: quiebras y premios hasta ×5 */
export function RuedaGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "rueda"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [last, setLast] = useState<{ multiplier: number; outcome: string; profit: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const disabled = busy || !user;
  const won = last?.outcome === "win";
  const lost = last?.outcome === "lose";

  async function handlePlay() {
    setBusy(true);
    setLast(null);
    setSpinning(true);

    const [res] = await Promise.all([play("rueda", "girar", amount), delay(4400)]);

    if (!res.ok) {
      setSpinning(false);
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const r = res.data;
    const idx = Number(r.result.index);
    // Giro acumulativo hasta el segmento premiado (el puntero queda arriba)
    const target = idx * SEG;
    setRotation((prev) => {
      const current = prev % 360;
      let delta = (360 - target) - current;
      delta = ((delta % 360) + 360) % 360;
      return prev + 360 * 4 + delta;
    });
    const m = r.multiplier;
    setLast({ multiplier: m, outcome: r.outcome, profit: r.profit });
    setHistory((h) => [m, ...h].slice(0, 10));
    toastResult(r.outcome, r.profit);
    await delay(4200); // deja terminar el giro visual antes de rehabilitar
    setSpinning(false);
    setBusy(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Zona de juego */}
      <div className="space-y-4">
        {/* Rueda */}
        <div className="casino-card p-4 sm:p-6">
          <div className="relative mx-auto w-fit">
            {/* Puntero dorado */}
            <div className="absolute left-1/2 top-[-6px] z-20 -translate-x-1/2" aria-hidden>
              <div className="size-0 border-x-[10px] border-x-transparent border-t-[16px] border-t-gold drop-shadow" />
            </div>
            {/* Rueda giratoria */}
            <div
              className="relative size-[min(300px,78vw)] rounded-full border-4 border-gold/60 shadow-[0_0_36px_rgba(0,0,0,0.55)]"
              style={{
                background: RUEDA_BG,
                transform: `rotate(${rotation}deg)`,
                transition: "transform 4s cubic-bezier(0.15, 0.9, 0.25, 1)",
              }}
              role="img"
              aria-label={`Rueda de la fortuna${last ? `, último resultado ${last.multiplier === 0 ? "quiebra" : fmtMult(last.multiplier)}` : ""}`}
            >
              {RUEDA_SEGMENTS.map((m, i) =>
                m > 0 ? (
                  <span
                    key={i}
                    className="absolute inset-0 flex items-start justify-center"
                    style={{ transform: `rotate(${i * SEG + SEG / 2}deg)` }}
                  >
                    <span className="pt-[8px] text-[10px] font-bold text-white">{fmtMult(m)}</span>
                  </span>
                ) : null,
              )}
            </div>
            {/* Buje central */}
            <div className="absolute left-1/2 top-1/2 z-10 grid size-14 sm:size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-gold/40 bg-zinc-900 shadow-inner">
              <FerrisWheel className={`size-6 sm:size-7 text-gold ${spinning ? "animate-spin" : ""}`} aria-hidden />
            </div>
          </div>

          {/* Leyenda de segmentos */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            {LEYENDA.map((l) => (
              <span
                key={l.m}
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${MULT_CHIP[l.m]}`}
              >
                <span className="inline-block size-2 rounded-full bg-white/70" aria-hidden />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* Visor del resultado */}
        <div
          className={`casino-card flex flex-col items-center justify-center py-6 min-h-28 transition-colors ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          {spinning ? (
            <span className="text-2xl sm:text-3xl font-extrabold text-muted-foreground animate-pulse">
              Girando…
            </span>
          ) : last ? (
            <motion.div
              key={history.length}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="flex flex-col items-center text-center"
            >
              {last.multiplier === 0 ? (
                <>
                  <span className="text-4xl sm:text-5xl font-extrabold text-lose">Quiebra</span>
                  <span className="mt-1 text-sm text-muted-foreground">
                    La rueda se lo llevó todo. Suerte en la próxima
                  </span>
                </>
              ) : (
                <>
                  <span className="text-4xl sm:text-5xl font-extrabold text-gold">
                    ¡{fmtMult(last.multiplier)}!
                  </span>
                  <span className="mt-1 text-sm font-bold text-win">+{fmtUSD(last.profit)}</span>
                </>
              )}
            </motion.div>
          ) : (
            <span className="text-muted-foreground text-sm flex items-center gap-2">
              <FerrisWheel className="size-4" aria-hidden />
              Gira la rueda y cruza los dedos
            </span>
          )}

          {/* Historial de giros */}
          {history.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Últimos giros:</span>
              {history.map((m, i) => (
                <span
                  key={`${m}-${i}`}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular ${MULT_CHIP[m]}`}
                >
                  {m === 0 ? "Quiebra" : fmtMult(m)}
                </span>
              ))}
            </div>
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
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Zap className="size-5" aria-hidden />}
            {busy ? "Girando…" : "Girar"}
          </Button>
          <p className="text-xs text-muted-foreground">
            26 casillas: <strong className="text-lose">14 quiebras</strong> y{" "}
            <strong className="text-win">12 premios</strong>… ¿te atreves?
          </p>
          <p className="text-xs text-muted-foreground">
            El <strong className="text-gold">×5</strong> aparece una sola vez. El <strong className="text-gold">×3</strong>{" "}
            también. El resto está repartido entre ×1,5 y ×2.
          </p>
        </div>
      </aside>
    </div>
  );
}
