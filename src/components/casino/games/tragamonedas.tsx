"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Cherry,
  Citrus,
  Crown,
  Gem,
  History,
  Loader2,
  Play,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

type SymbolId = "cereza" | "limon" | "campana" | "estrella" | "diamante" | "siete";

interface SlotSymbol {
  id: SymbolId;
  label: string;
  icon: LucideIcon;
  className: string;
}

const SYMBOLS: SlotSymbol[] = [
  { id: "cereza", label: "Cereza", icon: Cherry, className: "text-rose-400" },
  { id: "limon", label: "Limón", icon: Citrus, className: "text-yellow-400" },
  { id: "campana", label: "Campana", icon: Bell, className: "text-amber-400" },
  { id: "estrella", label: "Estrella", icon: Star, className: "text-gold" },
  { id: "diamante", label: "Diamante", icon: Gem, className: "text-emerald-300" },
  { id: "siete", label: "Siete", icon: Crown, className: "text-gold" },
];

const SYMBOL_MAP = Object.fromEntries(SYMBOLS.map((s) => [s.id, s])) as Record<SymbolId, SlotSymbol>;
const SYMBOL_IDS = new Set<string>(SYMBOLS.map((s) => s.id));

const PAYTABLE: { id: SymbolId; mult: number }[] = [
  { id: "cereza", mult: 4 },
  { id: "limon", mult: 6 },
  { id: "campana", mult: 10 },
  { id: "estrella", mult: 15 },
  { id: "diamante", mult: 40 },
  { id: "siete", mult: 50 },
];

function randomSymbol(): SymbolId {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id;
}

function isReels(v: unknown): v is SymbolId[] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((s) => typeof s === "string" && SYMBOL_IDS.has(s))
  );
}

function fmtMult(n: number): string {
  return n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/** TRAGAMONEDAS — tres rodillos: el trío paga hasta ×30 · dos cerezas ×2 · cualquier otro par ×0,5 */
export function TragamonedasGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "tragamonedas"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<SymbolId[]>(["cereza", "limon", "campana"]);
  const [last, setLast] = useState<{ outcome: string; multiplier: number; profit: number } | null>(null);
  const [history, setHistory] = useState<{ id: number; outcome: string; multiplier: number }[]>([]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stoppedRef = useRef(3); // rodillos ya detenidos en el giro en curso
  const idRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  // Limpia todos los temporizadores al desmontar
  useEffect(() => clearTimers, [clearTimers]);

  const disabled = busy || !user;
  const won = last?.outcome === "win";

  function failSpin(msg: string) {
    clearTimers();
    stoppedRef.current = 3;
    setSpinning(false);
    setBusy(false);
    toast.error(msg);
  }

  async function handleSpin() {
    setBusy(true);
    setLast(null);
    setSpinning(true);
    stoppedRef.current = 0;

    // Los rodillos libres muestran símbolos aleatorios mientras giran
    intervalRef.current = setInterval(() => {
      setReels((prev) => prev.map((s, i) => (i < stoppedRef.current ? s : randomSymbol())));
    }, 70);

    const [res] = await Promise.all([play("tragamonedas", "girar", amount), delay(2300)]);

    if (!res.ok) {
      failSpin(res.error);
      return;
    }

    const serverReels = res.data.result.reels;
    if (!isReels(serverReels)) {
      failSpin("Respuesta inválida del servidor");
      return;
    }

    const r = res.data;

    // Cada rodillo se detiene en secuencia con el símbolo del servidor
    for (let i = 0; i < serverReels.length; i++) {
      const idx = i;
      const symbol = serverReels[idx];
      timersRef.current.push(
        setTimeout(() => {
          stoppedRef.current = idx + 1;
          setReels((prev) => prev.map((s, j) => (j === idx ? symbol : s)));
        }, idx * 500),
      );
    }

    // Banner de resultado cuando el último rodillo ya se ha asentado
    timersRef.current.push(
      setTimeout(() => {
        clearTimers();
        setSpinning(false);
        setLast({ outcome: r.outcome, multiplier: r.multiplier, profit: r.profit });
        const entry = { id: ++idRef.current, outcome: r.outcome, multiplier: r.multiplier };
        setHistory((h) => [entry, ...h].slice(0, 8));
        toastResult(r.outcome, r.profit);
        setBusy(false);
      }, 1000 + 450),
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Zona de juego */}
      <div className="space-y-4">
        {/* Máquina */}
        <div className="casino-card flex flex-col items-center gap-5 p-5 pt-7 sm:p-8">
          <div className="flex items-center gap-3 sm:gap-4">
            {reels.map((sym, i) => {
              const S = SYMBOL_MAP[sym];
              const Icon = S.icon;
              return (
                <div
                  key={i}
                  className={`casino-card relative grid size-24 sm:size-28 place-items-center overflow-hidden transition-shadow ${
                    won ? "ring-2 ring-gold" : ""
                  }`}
                >
                  <motion.div
                    key={`${i}-${sym}`}
                    initial={{ y: -10, opacity: 0.4 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 480, damping: 24 }}
                    className="grid place-items-center"
                  >
                    <Icon className={`size-12 sm:size-14 ${S.className}`} aria-hidden />
                  </motion.div>
                  {/* Ventana del rodillo: sombras superior e inferior */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-black/50 to-transparent"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-black/50 to-transparent"
                  />
                </div>
              );
            })}
          </div>

          {/* Línea de premio */}
          <div className="flex flex-col items-center gap-1">
            <div aria-hidden className="flex items-center gap-2">
              <span className="h-px w-12 bg-gold/50" />
              <span className="size-1.5 rounded-full bg-gold" />
              <span className="h-px w-12 bg-gold/50" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Línea de premio
            </span>
          </div>

          {/* Resultado */}
          <div className="min-h-7 text-center" aria-live="polite">
            {spinning && (
              <span className="text-xs text-muted-foreground animate-pulse">Girando…</span>
            )}
            {!spinning && last && (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`text-lg font-extrabold ${
                  won ? "text-win" : last.outcome === "draw" ? "text-foreground" : "text-lose"
                }`}
              >
                {won && `¡Premio! ×${fmtMult(last.multiplier)} · +${fmtUSD(last.profit)}`}
                {last.outcome === "draw" && "Empate: apuesta devuelta"}
                {last.outcome === "lose" && "Sin premio esta vez"}
              </motion.p>
            )}
            {!spinning && !last && (
              <p className="text-sm text-muted-foreground">
                Alinea tres símbolos iguales sobre la línea de premio
              </p>
            )}
          </div>
        </div>

        {/* Tabla de premios */}
        <div className="casino-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Tabla de premios
          </p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {PAYTABLE.map((p) => {
              const s = SYMBOL_MAP[p.id];
              const Icon = s.icon;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-2.5 py-2"
                >
                  <Icon className={`size-4 shrink-0 ${s.className}`} aria-hidden />
                  <span className="truncate">{s.label}</span>
                  <span className="ml-auto font-extrabold text-gold tabular">×3 = ×{p.mult}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            2 cerezas pagan <strong className="text-gold">×2</strong> · cualquier otro par paga{" "}
            <strong className="text-gold">×0,5</strong>.
          </p>
        </div>

        {/* Historial */}
        {history.length > 0 && (
          <div className="casino-card p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <History className="size-3.5" aria-hidden /> Últimos giros
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {history.map((h) => (
                <span
                  key={h.id}
                  title={`Giro ×${fmtMult(h.multiplier)}`}
                  aria-label={`Último giro: multiplicador ${fmtMult(h.multiplier)}`}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold tabular ${
                    h.outcome === "win"
                      ? "bg-win/15 text-win"
                      : h.outcome === "draw"
                        ? "bg-zinc-600/40 text-zinc-300"
                        : "bg-lose/15 text-lose"
                  }`}
                >
                  ×{fmtMult(h.multiplier)}
                </span>
              ))}
            </div>
          </div>
        )}
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
            label="Apuesta por giro"
          />
          <Button
            className="w-full h-12 font-extrabold text-base"
            disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
            onClick={() => void handleSpin()}
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Play className="size-5" aria-hidden />
            )}
            {busy ? "Girando…" : "Girar"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Tres símbolos iguales pagan según la tabla. Dos cerezas{" "}
            <strong className="text-gold">×2</strong> y cualquier otro par{" "}
            <strong className="text-gold">×0,5</strong>.
          </p>
        </div>
      </aside>
    </div>
  );
}
