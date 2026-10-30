"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Dices, Loader2, Play } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

type Mode = "mayor" | "menor";
const HOUSE_EDGE = 1; // 1% de ventaja de la casa

/** DADO — apuesta mayor/menor con objetivo ajustable (2-98) */
export function DadoGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "dado"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [mode, setMode] = useState<Mode>("menor");
  const [target, setTarget] = useState(50);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [roll, setRoll] = useState<number | null>(null);
  const [last, setLast] = useState<{ outcome: string; profit: number; multiplier: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const disabled = busy || !user;
  const chance = mode === "mayor" ? 100 - target : target;
  const multiplier = Math.round(((100 - HOUSE_EDGE) / chance) * 100) / 100;
  const potential = Math.round(amount * multiplier * 100) / 100;

  async function handlePlay() {
    setBusy(true);
    setLast(null);
    setRolling(true);
    setRoll(null);
    intervalRef.current = setInterval(() => {
      setRoll(Math.floor(Math.random() * 10000) / 100);
    }, 50);

    const [res] = await Promise.all([play("dado", mode, amount, { target }), delay(1200)]);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRolling(false);

    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const r = res.data;
    setRoll(Number(r.result.roll));
    setLast({ outcome: r.outcome, profit: r.profit, multiplier: r.multiplier });
    toastResult(r.outcome, r.profit);
    setBusy(false);
  }

  const won = last?.outcome === "win";
  const lost = last?.outcome === "lose";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {/* Modo */}
        <div className="grid grid-cols-2 gap-3">
          {(["menor", "mayor"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => setMode(m)}
              className={`casino-card p-4 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                mode === m
                  ? "border-gold ring-2 ring-gold/60 bg-gold/5"
                  : "hover:border-gold/40 hover:bg-accent/40"
              }`}
              aria-pressed={mode === m}
            >
              {m === "mayor" ? (
                <ArrowUp className="mx-auto size-6 text-emerald-400" aria-hidden />
              ) : (
                <ArrowDown className="mx-auto size-6 text-red-400" aria-hidden />
              )}
              <span className="mt-1.5 block text-lg font-extrabold uppercase">
                {m === "mayor" ? "Mayor que" : "Menor que"}
              </span>
              <span className="text-xs text-muted-foreground">{m === "mayor" ? `Gana si sale > ${target}` : `Gana si sale < ${target}`}</span>
            </button>
          ))}
        </div>

        {/* Visor + pista */}
        <div
          className={`casino-card p-6 transition-colors ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          <div className="text-center">
            <Dices className={`mx-auto size-8 mb-2 ${rolling ? "animate-bounce text-gold" : "text-muted-foreground"}`} aria-hidden />
            <span
              className={`text-5xl sm:text-6xl font-extrabold tabular ${
                won ? "text-win" : lost ? "text-lose" : "text-foreground"
              }`}
            >
              {roll === null ? "—" : roll.toFixed(2)}
            </span>
            {last && !rolling && (
              <p className={`mt-1 text-sm font-bold ${won ? "text-win" : "text-lose"}`}>
                {won ? `×${last.multiplier} · +${fmtUSD(last.profit)}` : "No salió tu número"}
              </p>
            )}
            {rolling && <p className="mt-1 text-xs text-muted-foreground animate-pulse">Rodando…</p>}
          </div>

          {/* Pista de resultado */}
          <div className="relative mt-8">
            <div className="relative h-3 rounded-full overflow-hidden bg-zinc-800">
              <div
                className="absolute inset-y-0 bg-emerald-500/80"
                style={
                  mode === "menor"
                    ? { left: 0, width: `${target}%` }
                    : { left: `${target}%`, right: 0 }
                }
              />
            </div>
            {/* Marcador del objetivo */}
            <div
              className="absolute -top-1.5 h-6 w-1 rounded bg-gold -translate-x-1/2"
              style={{ left: `${target}%` }}
              aria-hidden
            />
            {/* Marcador de la tirada */}
            {roll !== null && (
              <div
                className={`absolute -bottom-6 -translate-x-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  won ? "bg-win text-emerald-950" : "bg-lose text-white"
                }`}
                style={{ left: `${Math.min(98, Math.max(2, roll))}%` }}
                aria-hidden
              >
                ▲
              </div>
            )}
          </div>
        </div>

        {/* Objetivo */}
        <div className="casino-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="target-slider" className="text-sm font-bold">
              Objetivo: <span className="text-gold tabular">{target}</span>
            </label>
            <span className="text-xs text-muted-foreground">2 – 98</span>
          </div>
          <Slider
            id="target-slider"
            min={2}
            max={98}
            step={1}
            value={[target]}
            disabled={disabled}
            onValueChange={(v) => setTarget(v[0] ?? 50)}
            className="py-2"
          />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-background/60 border border-border/60 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">Probabilidad</p>
              <p className="font-bold tabular">{chance.toFixed(0)}%</p>
            </div>
            <div className="rounded-lg bg-background/60 border border-border/60 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">Multiplicador</p>
              <p className="font-bold tabular text-gold">×{multiplier.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-background/60 border border-border/60 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">Pago potencial</p>
              <p className="font-bold tabular text-win">{fmtUSD(potential)}</p>
            </div>
          </div>
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
            disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
            onClick={() => void handlePlay()}
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Dices className="size-5" aria-hidden />}
            {busy ? "Rodando…" : "Lanzar dado"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Cuanto más restringido el objetivo, mayor multiplicador (hasta{" "}
            <strong className="text-gold">×49,5</strong>). Ventaja de la casa: 1%.
          </p>
        </div>
      </aside>
    </div>
  );
}
