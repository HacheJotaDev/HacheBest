"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Coins, Loader2, RotateCcw, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────
// Crash (juego de sesión): multiplicador en vivo con curva,
// retiro manual o automático y detección de crash por tick.
// ─────────────────────────────────────────────────────────────

type Phase = "idle" | "flying" | "finished";

/** Estado público que envía el servidor (publicCrash) */
interface CrashState {
  startedAt: number;
  serverNow: number;
  growth: number;
}

interface CrashFinal {
  outcome: "win" | "lose";
  profit: number;
  multiplier?: number;
  crashPoint?: number;
}

interface CurvePoint {
  t: number;
  m: number;
}

interface HistoryEntry {
  id: number;
  v: number;
}

function fmtX(n: number): string {
  return `×${n.toFixed(2).replace(".", ",")}`;
}

/** Punto de la curva en el viewBox 0..100 (t en segundos, m multiplicador) */
function curveXY(p: CurvePoint): [number, number] {
  const x = Math.min(p.t / 25, 1) * 100;
  const y = 100 - Math.min((p.m - 1) / 9, 1) * 88;
  return [x, y];
}

/** CRASH — apuesta en vuelo: retírate antes del crash o pierdes la apuesta */
export function CrashGame() {
  const sessionStart = useCasino((s) => s.sessionStart);
  const sessionAct = useCasino((s) => s.sessionAct);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "crash"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [phase, setPhase] = useState<Phase>("idle");
  const [amount, setAmount] = useState(10);
  const [autoInput, setAutoInput] = useState("");
  const [auto, setAuto] = useState<number | null>(null);
  const [betId, setBetId] = useState<string | null>(null);
  const [crash, setCrash] = useState<CrashState | null>(null);
  const [mult, setMult] = useState(1);
  const [points, setPoints] = useState<CurvePoint[]>([{ t: 0, m: 1 }]);
  const [final, setFinal] = useState<CrashFinal | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const mountedRef = useRef(true);
  const offsetRef = useRef(0);
  const multRef = useRef(1);
  const cashedRef = useRef(false);
  const autoRef = useRef<number | null>(null);
  const lastPointRef = useRef(0);
  const toastErrRef = useRef(false);
  const idRef = useRef(0);

  const disabled = busy || !user;

  // Guardia contra setState tras desmontar (incluye StrictMode: true → false → true)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pushHistory = useCallback((v: number) => {
    idRef.current += 1;
    const id = idRef.current;
    setHistory((h) => [{ id, v }, ...h].slice(0, 10));
    setHighlight(id);
  }, []);

  const doCashout = useCallback(async () => {
    if (cashedRef.current || !betId) return;
    cashedRef.current = true;
    const res = await sessionAct("crash", betId, "cashout");
    if (!mountedRef.current) return;
    if (!res.ok) {
      cashedRef.current = false;
      toast.error(res.error);
      return;
    }
    if (!res.data.settled) {
      cashedRef.current = false;
      return;
    }
    if (res.data.outcome === "win") {
      const m = res.data.multiplier ?? multRef.current;
      pushHistory(m);
      setFinal({ outcome: "win", profit: res.data.profit ?? 0, multiplier: m });
      toastResult("win", res.data.profit ?? 0);
    } else {
      const cp = Number(res.data.result?.crashPoint ?? multRef.current);
      pushHistory(cp);
      setFinal({ outcome: "lose", profit: res.data.profit ?? -amount, crashPoint: cp });
      toastResult("lose", -amount);
    }
    setPhase("finished");
  }, [betId, amount, sessionAct, pushHistory]);

  async function start() {
    if (disabled || amount > (user?.balance ?? 0) || amount < min) return;
    setBusy(true);
    setFinal(null);
    const res = await sessionStart("crash", amount);
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const st = res.data.state as unknown as CrashState | undefined;
    if (!st) {
      setBusy(false);
      toast.error("No se pudo iniciar la ronda");
      return;
    }
    const parsed = Number(autoInput);
    const autoVal =
      autoInput.trim() !== "" && Number.isFinite(parsed) && parsed >= 1.01
        ? Math.round(parsed * 100) / 100
        : null;
    autoRef.current = autoVal;
    setAuto(autoVal);
    cashedRef.current = false;
    toastErrRef.current = false;
    lastPointRef.current = 0;
    multRef.current = 1;
    offsetRef.current = (res.data.serverNow ?? Date.now()) - Date.now();
    setCrash(st);
    setBetId(res.data.betId);
    setMult(1);
    setPoints([{ t: 0, m: 1 }]);
    setHighlight(null);
    setPhase("flying");
    setBusy(false);
  }

  // Bucle de vuelo: rAF para el multiplicador local + tick de 600 ms contra el servidor.
  // Todos los temporizadores se limpian en el teardown; los valores vivos van en refs
  // para que el bucle sea reiniciable (StrictMode monta, desmonta y vuelve a montar).
  useEffect(() => {
    if (phase !== "flying" || !betId || !crash) return;
    const { startedAt, growth } = crash;

    let raf = 0;
    const loop = () => {
      if (!mountedRef.current) return;
      const t = Math.max(0, (Date.now() + offsetRef.current - startedAt) / 1000);
      const m = Math.floor(Math.exp(growth * t) * 100) / 100;
      multRef.current = m;
      setMult(m);
      if (t - lastPointRef.current >= 0.1) {
        lastPointRef.current = t;
        setPoints((prev) => {
          const next = prev.length >= 400 ? prev.slice(prev.length - 399) : prev.slice();
          next.push({ t, m });
          return next;
        });
      }
      const autoVal = autoRef.current;
      if (autoVal !== null && !cashedRef.current && m >= autoVal) {
        cashedRef.current = true;
        void doCashout();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const tick = setInterval(() => {
      if (cashedRef.current || !mountedRef.current) return;
      void sessionAct("crash", betId, "tick").then((res) => {
        if (!mountedRef.current || cashedRef.current) return;
        if (!res.ok) {
          if (!toastErrRef.current) {
            toastErrRef.current = true;
            toast.error(res.error);
          }
          return;
        }
        if (res.data.settled) {
          const cp = Number(res.data.result?.crashPoint ?? multRef.current);
          pushHistory(cp);
          setFinal({ outcome: "lose", profit: res.data.profit ?? -amount, crashPoint: cp });
          setPhase("finished");
          toastResult("lose", -amount);
        }
      });
    }, 600);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(tick);
    };
  }, [phase, betId, crash, amount, sessionAct, pushHistory, doCashout]);

  function reset() {
    setPhase("idle");
    setFinal(null);
    setBetId(null);
    setCrash(null);
  }

  const won = phase === "finished" && final?.outcome === "win";
  const crashed = phase === "finished" && final?.outcome === "lose";
  const displayMult =
    phase === "finished" && final
      ? final.outcome === "lose"
        ? (final.crashPoint ?? 1)
        : (final.multiplier ?? mult)
      : mult;

  const curve = useMemo(() => {
    const coords = points.map((p) => curveXY(p));
    const fmt = (c: [number, number]) => `${c[0].toFixed(2)},${c[1].toFixed(2)}`;
    const line = coords.map(fmt).join(" ");
    const lastCoord = coords.length > 0 ? coords[coords.length - 1] : null;
    const area =
      lastCoord && coords.length > 1
        ? `M 0,100 L ${coords.map(fmt).join(" L ")} L ${lastCoord[0].toFixed(2)},100 Z`
        : "";
    return { line, area };
  }, [points]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Zona de vuelo */}
      <div className="space-y-4">
        <div
          className={`casino-card relative overflow-hidden p-4 sm:p-6 ${
            won ? "border-win/60" : crashed ? "border-lose/50" : ""
          }`}
        >
          {phase === "idle" ? (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center">
              <Rocket className="size-10 text-gold" aria-hidden />
              <p className="text-xl font-extrabold">Crash</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                El multiplicador despega y crece cada segundo. Retírate antes del crash para cobrar
                tu apuesta multiplicada.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center justify-center py-6" aria-live="polite">
                <span
                  className={`text-5xl font-extrabold tabular-nums sm:text-7xl ${
                    crashed ? "text-lose" : "text-emerald-400"
                  }`}
                >
                  {fmtX(displayMult)}
                </span>
                <span className="mt-2 text-sm text-muted-foreground">
                  {phase === "flying"
                    ? `${fmtUSD(amount * mult)} en juego`
                    : won
                      ? `${fmtUSD(final?.profit ?? 0)} cobrados`
                      : `Crash en ${fmtX(displayMult)}`}
                </span>
              </div>
              <div className="relative h-40 sm:h-56" aria-hidden>
                <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="crashGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {curve.area && <path d={curve.area} fill="url(#crashGrad)" />}
                  <polyline
                    points={curve.line}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {crashed && (
                  <motion.div
                    className="pointer-events-none absolute inset-0 bg-red-500/15"
                    initial={{ opacity: 0.7 }}
                    animate={{ opacity: [0.7, 0.1, 0.4, 0] }}
                    transition={{ duration: 0.9 }}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Historial de puntos de crash */}
        {history.length > 0 && (
          <div className="casino-card flex flex-wrap items-center gap-1.5 p-3">
            <span className="mr-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Historial
            </span>
            {history.map((h) => {
              const tone =
                h.v >= 10
                  ? "border-gold/40 bg-gold/5 text-gold"
                  : h.v >= 2
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                    : "border-red-500/30 bg-red-500/5 text-red-400";
              return (
                <span
                  key={h.id}
                  className={`rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${tone} ${
                    h.id === highlight ? "ring-1 ring-gold/60" : ""
                  }`}
                >
                  {fmtX(h.v)}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Controles de apuesta */}
      <aside className="space-y-4">
        {phase === "idle" && (
          <div className="casino-card space-y-4 p-4">
            <BetInput
              value={amount}
              onChange={setAmount}
              min={min}
              max={max}
              balance={user?.balance ?? 0}
              disabled={disabled}
              label="Apuesta por ronda"
            />
            <div className="space-y-2">
              <label
                htmlFor="crash-auto"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Retiro automático (opcional, ×)
              </label>
              <Input
                id="crash-auto"
                type="number"
                step={0.1}
                min={1.01}
                placeholder="Ej: 2"
                value={autoInput}
                onChange={(e) => setAutoInput(e.target.value)}
                disabled={disabled}
                className="h-11 bg-background/60 font-semibold"
                aria-label="Retiro automático (opcional, ×)"
              />
              <p className="text-xs text-muted-foreground">
                Déjalo vacío para retirarte manualmente.
              </p>
            </div>
            <Button
              className="h-12 w-full text-base font-extrabold"
              disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
              onClick={() => void start()}
            >
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Rocket className="size-5" aria-hidden />}
              {busy ? "Despegando…" : "Despegar"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Si el crash llega antes de tu retiro, pierdes la apuesta.
            </p>
          </div>
        )}

        {phase === "flying" && (
          <div className="casino-card space-y-3 p-4">
            <p className="text-sm font-bold">Ronda en curso</p>
            <p className="text-xs text-muted-foreground">{fmtUSD(amount)} en juego.</p>
            {auto !== null && (
              <p className="text-xs text-muted-foreground">
                Retiro automático activo a <strong className="text-gold">{fmtX(auto)}</strong>.
              </p>
            )}
            <Button
              className="h-12 w-full bg-gold text-base font-extrabold text-gold-foreground hover:bg-gold/90"
              onClick={() => void doCashout()}
            >
              <Coins className="size-5" aria-hidden /> Retirar {fmtUSD(amount * mult)}
            </Button>
          </div>
        )}

        {phase === "finished" && final && (
          <div className="casino-card space-y-4 p-4">
            <div
              className={`rounded-lg border p-3 text-center font-bold ${
                won ? "border-win/40 bg-win/10 text-win" : "border-lose/40 bg-lose/10 text-lose"
              }`}
              aria-live="polite"
            >
              {won && `+${fmtUSD(final.profit)} · retirado a ${fmtX(final.multiplier ?? 1)}`}
              {crashed && `Crash en ${fmtX(final.crashPoint ?? 1)}`}
            </div>
            <Button className="h-12 w-full font-extrabold" onClick={reset}>
              <RotateCcw className="size-5" aria-hidden /> Nueva ronda
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
