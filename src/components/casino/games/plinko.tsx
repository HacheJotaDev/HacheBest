"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CircleDot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

// debe coincidir con src/lib/games.ts
const PLINKO_ROWS = 12;
const PLINKO_TABLES: Record<"bajo" | "medio" | "alto", number[]> = {
  bajo: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
  medio: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
  alto: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
};

type Risk = "bajo" | "medio" | "alto";

const RISKS: { id: Risk; label: string; max: string }[] = [
  { id: "bajo", label: "Bajo", max: "×10" },
  { id: "medio", label: "Medio", max: "×33" },
  { id: "alto", label: "Alto", max: "×170" },
];

const fmtMult = (m: number) => `×${String(m).replace(".", ",")}`;

/** Color de cada cubeta según su multiplicador */
function bucketClass(m: number): string {
  if (m < 1) return "bg-zinc-700 text-white";
  if (m < 2) return "bg-emerald-700 text-white";
  if (m < 10) return "bg-amber-500 text-zinc-950";
  return "bg-red-500 text-white";
}

/**
 * Posición de la bola tras `step` rebotes:
 * x = (1 + pasos a la derecha acumulados) * (100/14) · y = 8 + step * (84/13)
 */
function ballPos(step: number, path: number[]): { x: number; y: number } {
  let cum = 0;
  for (let i = 0; i < step && i < path.length; i++) cum += path[i] ?? 0;
  return { x: (1 + cum) * (100 / 14), y: 8 + step * (84 / 13) };
}

/** PLINKO — la bola cae 12 filas de pinchos hasta una de las 13 cubetas */
export function PlinkoGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "plinko"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [risk, setRisk] = useState<Risk>("medio");
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [path, setPath] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [landing, setLanding] = useState<number | null>(null);
  const [dropId, setDropId] = useState(0);
  const [last, setLast] = useState<{ multiplier: number; outcome: string; profit: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const disabled = busy || !user;
  const won = last?.outcome === "win";
  const lost = last?.outcome === "lose";
  const bp = ballPos(step, path);

  async function handleDrop() {
    setBusy(true);
    setLast(null);
    setLanding(null);
    setStep(0);
    setDropping(true);
    setDropId((d) => d + 1);

    const [res] = await Promise.all([play("plinko", "drop", amount, { risk }), delay(150)]);

    if (!res.ok) {
      setDropping(false);
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const r = res.data;
    const raw = r.result.path;
    const p: number[] = Array.isArray(raw) ? raw.map(Number) : [];
    setPath(p);

    // Caída: 12 rebotes encadenados de 95 ms (~1,1 s)
    for (let i = 1; i <= PLINKO_ROWS; i++) {
      setStep(i);
      await delay(95);
    }

    const bucket = p.reduce((a, b) => a + b, 0);
    setLanding(bucket);
    setLast({ multiplier: r.multiplier, outcome: r.outcome, profit: r.profit });
    setHistory((h) => [r.multiplier, ...h].slice(0, 10));
    toastResult(r.outcome, r.profit);
    setDropping(false);
    setBusy(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Zona de juego */}
      <div className="space-y-4">
        {/* Selector de riesgo */}
        <div className="grid grid-cols-3 gap-3">
          {RISKS.map((rk) => (
            <button
              key={rk.id}
              type="button"
              disabled={disabled}
              onClick={() => setRisk(rk.id)}
              className={`casino-card p-3 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                risk === rk.id
                  ? "border-gold ring-2 ring-gold bg-gold/5"
                  : "hover:border-gold/40 hover:bg-accent/40"
              }`}
              aria-pressed={risk === rk.id}
            >
              <span className="block text-sm font-extrabold uppercase">{rk.label}</span>
              <span className="mt-1 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold text-gold">
                máx {rk.max}
              </span>
            </button>
          ))}
        </div>

        {/* Tablero */}
        <div className="casino-card p-4">
          <div className="relative mx-auto aspect-[4/5] max-w-md">
            {/* Pinchos decorativos: la fila r tiene r+3 clavos, filas alternas desfasadas medio paso */}
            {Array.from({ length: PLINKO_ROWS }, (_, r) => {
              const count = r + 3;
              const span = 76 / (r % 2 === 0 ? count - 1 : count);
              return Array.from({ length: count }, (_, k) => {
                const x = 12 + (r % 2 === 0 ? k * span : (k + 0.5) * span);
                const y = 8 + (r + 0.5) * (84 / 13);
                return (
                  <span
                    key={`p${r}-${k}`}
                    className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-500/50"
                    style={{ left: `${x}%`, top: `${y}%` }}
                    aria-hidden
                  />
                );
              });
            })}

            {/* Bola */}
            <motion.div
              className="absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow shadow-amber-400/50"
              style={{ left: `${bp.x}%`, top: `${bp.y}%` }}
              initial={false}
              animate={{ left: `${bp.x}%`, top: `${bp.y}%` }}
              transition={{ duration: 0.1, ease: "linear" }}
            />

            {/* Cubetas */}
            <div className="absolute inset-x-0 bottom-0 flex gap-px">
              {PLINKO_TABLES[risk].map((m, j) => {
                const isLanding = landing === j;
                const cellCls = `flex-1 whitespace-nowrap rounded-b-md py-1.5 text-center ${bucketClass(m)} ${
                  isLanding ? "ring-2 ring-gold" : ""
                }`;
                return isLanding ? (
                  <motion.div
                    key={`land-${dropId}`}
                    initial={{ y: 0 }}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 0.35 }}
                    className={cellCls}
                  >
                    <span className="text-[10px] sm:text-xs font-bold tabular">{fmtMult(m)}</span>
                  </motion.div>
                ) : (
                  <div key={j} className={cellCls}>
                    <span className="text-[10px] sm:text-xs font-bold tabular">{fmtMult(m)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Visor del resultado */}
        <div
          className={`casino-card flex flex-col items-center justify-center py-6 min-h-24 transition-colors ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          {dropping ? (
            <span className="text-2xl sm:text-3xl font-extrabold text-muted-foreground animate-pulse">
              La bola cae…
            </span>
          ) : last ? (
            <motion.div
              key={dropId}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="flex flex-col items-center text-center"
            >
              <span
                className={`text-4xl font-extrabold tabular ${
                  won ? "text-gold" : lost ? "text-lose" : "text-foreground"
                }`}
              >
                {fmtMult(last.multiplier)}
              </span>
              <span className="mt-1 text-sm font-bold">
                {won && <span className="text-win">+{fmtUSD(last.profit)}</span>}
                {lost && <span className="text-lose">-{fmtUSD(amount)}</span>}
                {last.outcome === "draw" && (
                  <span className="text-muted-foreground">Apuesta devuelta</span>
                )}
              </span>
            </motion.div>
          ) : (
            <span className="text-muted-foreground text-sm flex items-center gap-2">
              <CircleDot className="size-4" aria-hidden />
              Suelta la bola y reza por los bordes
            </span>
          )}

          {/* Historial de caídas */}
          {history.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Últimas caídas:</span>
              {history.map((m, i) => (
                <span
                  key={`${m}-${i}`}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular ${bucketClass(m)}`}
                >
                  {fmtMult(m)}
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
            onClick={() => void handleDrop()}
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <CircleDot className="size-5" aria-hidden />}
            {busy ? "Cayendo…" : "Soltar bola"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Los bordes pagan más: <strong className="text-gold">×33</strong> en medio y{" "}
            <strong className="text-gold">×170</strong> en alto. El centro casi siempre devuelve menos.
          </p>
          <p className="text-xs text-muted-foreground">
            Nivel de riesgo actual: <strong className="text-gold uppercase">{risk}</strong>
          </p>
        </div>
      </aside>
    </div>
  );
}
