"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Dices, Loader2, Play, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { COLOR_CLASSES, delay, rouletteColor, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

const NUMBERS = Array.from({ length: 37 }, (_, i) => i);

/** NÚMERO EXACTO — ruleta 0-36 que paga ×36 */
export function ExactoGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "exacto"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [last, setLast] = useState<{ number: number; outcome: string; profit: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const disabled = busy || !user;

  async function handlePlay() {
    if (picked === null) {
      toast.error("Elige un número de la ruleta");
      return;
    }
    setBusy(true);
    setLast(null);
    setSpinning(true);

    // Recorrido tipo ruleta: gira rápido y frena en el resultado
    const [res] = await Promise.all([play("exacto", "exacto", amount, { number: picked }), delay(2200)]);
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (!res.ok) {
      setHighlight(null);
      setSpinning(false);
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const r = res.data;
    const result = Number(r.result.number);
    // Barrido final hasta el número ganador
    for (let i = (highlight ?? 0) + 1; i <= (highlight ?? 0) + 37; i++) {
      setHighlight(i % 37);
      await delay(Math.min(90, 15 + i * 1.5));
    }
    setHighlight(result);
    setSpinning(false);
    setLast({ number: result, outcome: r.outcome, profit: r.profit });
    toastResult(r.outcome, r.profit);
    setBusy(false);
  }

  const won = last?.outcome === "win";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {/* Tablero de ruleta */}
        <div className="casino-card p-4">
          <div className="grid grid-cols-9 sm:grid-cols-12 gap-1.5">
            {NUMBERS.map((n) => {
              const color = rouletteColor(n);
              const isPicked = picked === n;
              const isHighlight = highlight === n;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  onClick={() => !spinning && setPicked(n)}
                  className={`
                    aspect-square rounded-md border text-xs sm:text-sm font-bold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring
                    ${COLOR_CLASSES[color]} text-white
                    ${isPicked && !spinning ? "ring-2 ring-gold ring-offset-2 ring-offset-card scale-105" : ""}
                    ${isHighlight && spinning ? "ring-2 ring-white scale-110 brightness-125" : ""}
                    ${isHighlight && !spinning && won ? "ring-2 ring-gold scale-110" : ""}
                    ${!spinning ? "hover:brightness-125" : "cursor-default"}
                  `}
                  aria-label={`Número ${n} (${color})`}
                  aria-pressed={isPicked}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 rounded bg-red-600" aria-hidden /> Rojo (18)
              <span className="inline-block size-3 rounded bg-zinc-800 ml-2" aria-hidden /> Negro (18)
              <span className="inline-block size-3 rounded bg-emerald-600 ml-2" aria-hidden /> Verde (0)
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={disabled}
              onClick={() => setPicked(Math.floor(Math.random() * 37))}
            >
              <Shuffle className="size-3.5" aria-hidden /> Aleatorio
            </Button>
          </div>
        </div>

        {/* Visor */}
        <div
          className={`casino-card flex items-center justify-center gap-4 py-6 min-h-24 transition-colors ${
            won ? "border-win/60 bg-win/5" : last?.outcome === "lose" ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          {spinning ? (
            <span className="text-3xl font-extrabold text-muted-foreground animate-pulse">
              ¡No va más!
            </span>
          ) : last ? (
            <>
              <span
                className={`grid place-items-center size-16 rounded-xl border-2 text-2xl font-extrabold text-white ${COLOR_CLASSES[rouletteColor(last.number)]}`}
              >
                {last.number}
              </span>
              <div>
                <p className="font-bold">{won ? "¡Número premiado!" : "Otra vez será"}</p>
                <p className="text-sm text-muted-foreground">
                  Salió el <strong>{last.number}</strong> ({rouletteColor(last.number)}) ·{" "}
                  {won ? (
                    <span className="text-win font-bold">+{fmtUSD(last.profit)}</span>
                  ) : (
                    <span className="text-lose font-bold">-{fmtUSD(amount)}</span>
                  )}
                </p>
              </div>
            </>
          ) : (
            <span className="text-muted-foreground text-sm flex items-center gap-2">
              <Dices className="size-4" aria-hidden />
              Elige tu número y lanza la bola
            </span>
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
          <div className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Tu número: </span>
            <strong className="text-gold text-lg">{picked ?? "—"}</strong>
            {picked !== null && (
              <span className="ml-2 text-xs uppercase text-muted-foreground">
                {rouletteColor(picked)}
              </span>
            )}
          </div>
          <Button
            className="w-full h-12 font-extrabold text-base"
            disabled={disabled || picked === null || amount > (user?.balance ?? 0) || amount < min}
            onClick={() => void handlePlay()}
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5" aria-hidden />}
            {busy ? "Girando…" : "¡No va más!"}
          </Button>
          <p className="text-xs text-muted-foreground">
            37 números, uno premiado: acertar paga <strong className="text-gold">×36</strong>.
          </p>
        </div>
      </aside>
    </div>
  );
}
