"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Dices, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { COLOR_CLASSES, delay, rouletteColor, toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

type Categoria = "pleno" | "colores" | "paridad" | "mitades" | "docenas";
type Seleccion =
  | "rojo"
  | "negro"
  | "par"
  | "impar"
  | "bajo"
  | "alto"
  | "docena1"
  | "docena2"
  | "docena3";

const NUMBERS = Array.from({ length: 37 }, (_, i) => i);

// Orden horario de los números en la rueda europea (empezando en el 0)
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const SEG = 360 / 37;

const COLOR_HEX: Record<string, string> = {
  verde: "#059669",
  rojo: "#dc2626",
  negro: "#27272a",
};
const colorHex = (c: string) => COLOR_HEX[c] ?? "#27272a";

// Fondo de la rueda: 37 sectores como conic-gradient (se construye una sola vez a nivel de módulo)
const WHEEL_BG = `conic-gradient(${WHEEL_ORDER.map((_, i) => {
  const c = colorHex(rouletteColor(WHEEL_ORDER[i]!));
  const a1 = i * SEG;
  const a2 = (i + 1) * SEG;
  return `${c} ${a1}deg ${a2}deg`;
}).join(", ")})`;

const CATEGORIES: { id: Categoria; label: string }[] = [
  { id: "pleno", label: "Pleno" },
  { id: "colores", label: "Colores" },
  { id: "paridad", label: "Paridad" },
  { id: "mitades", label: "Mitades" },
  { id: "docenas", label: "Docenas" },
];

const PAGOS: Record<Categoria, number> = {
  pleno: 36,
  colores: 2,
  paridad: 2,
  mitades: 2,
  docenas: 3,
};

const OPCIONES: Record<
  Exclude<Categoria, "pleno">,
  { id: Seleccion; label: string; sub: string; swatch?: string }[]
> = {
  colores: [
    { id: "rojo", label: "Rojo", sub: "18 números", swatch: "bg-red-600 border-red-400" },
    { id: "negro", label: "Negro", sub: "18 números", swatch: "bg-zinc-800 border-zinc-600" },
  ],
  paridad: [
    { id: "par", label: "Par", sub: "2, 4, 6…" },
    { id: "impar", label: "Impar", sub: "1, 3, 5…" },
  ],
  mitades: [
    { id: "bajo", label: "Bajo", sub: "1 – 18" },
    { id: "alto", label: "Alto", sub: "19 – 36" },
  ],
  docenas: [
    { id: "docena1", label: "1.ª 12", sub: "1 – 12" },
    { id: "docena2", label: "2.ª 12", sub: "13 – 24" },
    { id: "docena3", label: "3.ª 12", sub: "25 – 36" },
  ],
};

/** RULETA europea 0-36 — plenos, colores, paridad, mitades y docenas */
export function RuletaGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "ruleta"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [categoria, setCategoria] = useState<Categoria>("pleno");
  const [picked, setPicked] = useState<number | null>(null);
  const [pick, setPick] = useState<Seleccion | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [last, setLast] = useState<{ number: number; outcome: string; profit: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const disabled = busy || !user;

  async function handlePlay() {
    if (categoria === "pleno" && picked === null) {
      toast.error("Elige un número de la ruleta");
      return;
    }
    if (categoria !== "pleno" && pick === null) {
      toast.error("Elige una opción antes de apostar");
      return;
    }
    const betType: string = categoria === "pleno" ? "pleno" : (pick ?? "rojo");
    const extra: Record<string, unknown> | undefined =
      categoria === "pleno" ? { number: picked } : undefined;

    setBusy(true);
    setLast(null);
    setSpinning(true);

    const [res] = await Promise.all([play("ruleta", betType, amount, extra), delay(4600)]);

    if (!res.ok) {
      setSpinning(false);
      setBusy(false);
      toast.error(res.error);
      return;
    }
    const r = res.data;
    const n = Number(r.result.number);
    // Giro acumulativo hasta el bolsillo ganador (el puntero queda arriba)
    const pocketIdx = WHEEL_ORDER.indexOf(n);
    const target = pocketIdx * SEG;
    setRotation((prev) => {
      const current = prev % 360;
      let delta = (360 - target) - current;
      delta = ((delta % 360) + 360) % 360;
      return prev + 360 * 5 + delta;
    });
    setLast({ number: n, outcome: r.outcome, profit: r.profit });
    setHistory((h) => [n, ...h].slice(0, 10));
    toastResult(r.outcome, r.profit);
    await delay(4400); // deja terminar el giro visual antes de rehabilitar
    setSpinning(false);
    setBusy(false);
  }

  const won = last?.outcome === "win";
  const lost = last?.outcome === "lose";
  const pago = PAGOS[categoria];
  const resumen =
    categoria === "pleno"
      ? `Pleno al ${picked ?? "—"} · paga ×${pago}`
      : `${OPCIONES[categoria].find((o) => o.id === pick)?.label ?? "Elige una opción"} · paga ×${pago}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Zona de juego */}
      <div className="space-y-4">
        {/* Selector de categoría */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de apuesta">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                setCategoria(c.id);
                if (c.id !== "pleno") setPick(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                categoria === c.id
                  ? "border-gold text-gold bg-gold/5"
                  : "border-border/70 text-muted-foreground hover:border-gold/40 hover:text-foreground"
              }`}
              aria-pressed={categoria === c.id}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Opciones según categoría */}
        {categoria === "pleno" ? (
          <div className="casino-card p-4">
            <div className="grid grid-cols-9 sm:grid-cols-12 gap-1.5">
              {NUMBERS.map((n) => {
                const color = rouletteColor(n);
                const isPicked = picked === n;
                const isLast = !spinning && last?.number === n;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => setPicked(n)}
                    className={`aspect-square rounded-md border text-xs sm:text-sm font-bold text-white transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${COLOR_CLASSES[color]} ${
                      isPicked ? "ring-2 ring-gold ring-offset-2 ring-offset-card scale-105" : ""
                    } ${isLast ? "ring-2 ring-gold/70" : ""} ${spinning ? "cursor-default" : "hover:brightness-125"}`}
                    aria-label={`Número ${n} (${color})`}
                    aria-pressed={isPicked}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={`grid gap-3 ${categoria === "docenas" ? "grid-cols-3" : "grid-cols-2"}`}>
            {OPCIONES[categoria].map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={() => setPick(o.id)}
                className={`casino-card p-4 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  pick === o.id
                    ? "border-gold ring-2 ring-gold/60 bg-gold/5"
                    : "hover:border-gold/40 hover:bg-accent/40"
                }`}
                aria-pressed={pick === o.id}
              >
                {o.swatch && (
                  <span className={`mb-1.5 inline-block size-4 rounded border ${o.swatch}`} aria-hidden />
                )}
                <span className="block text-lg font-extrabold uppercase">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.sub}</span>
              </button>
            ))}
          </div>
        )}

        {/* Rueda */}
        <div className="casino-card p-4 sm:p-6">
          <div className="relative mx-auto w-fit">
            {/* Puntero dorado */}
            <div className="absolute left-1/2 top-[-6px] z-20 -translate-x-1/2" aria-hidden>
              <div className="size-0 border-x-[10px] border-x-transparent border-t-[16px] border-t-gold drop-shadow" />
            </div>
            {/* Rueda giratoria */}
            <div
              className="relative size-[min(320px,80vw)] rounded-full border-4 border-gold/60 shadow-[0_0_36px_rgba(0,0,0,0.55)]"
              style={{
                background: WHEEL_BG,
                transform: `rotate(${rotation}deg)`,
                transition: "transform 4.2s cubic-bezier(0.15, 0.9, 0.25, 1)",
              }}
              role="img"
              aria-label={`Ruleta europea${last ? `, último número ${last.number}` : ""}`}
            >
              {WHEEL_ORDER.map((n, i) => (
                <span
                  key={n}
                  className="absolute inset-0 flex items-start justify-center"
                  style={{ transform: `rotate(${i * SEG + SEG / 2}deg)` }}
                >
                  <span className="pt-[9px] text-[10px] font-bold text-white">{n}</span>
                </span>
              ))}
            </div>
            {/* Buje central */}
            <div className="absolute left-1/2 top-1/2 z-10 grid size-14 sm:size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-gold/40 bg-zinc-900 shadow-inner">
              <Dices className={`size-6 sm:size-7 text-gold ${spinning ? "animate-spin" : ""}`} aria-hidden />
            </div>
          </div>

          {/* Historial de números */}
          {history.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Últimos números:</span>
              {history.map((n, idx) => (
                <span
                  key={`${n}-${idx}`}
                  className={`grid size-6 place-items-center rounded border text-[10px] font-bold text-white ${COLOR_CLASSES[rouletteColor(n)]}`}
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Visor del resultado */}
        <div
          className={`casino-card flex items-center justify-center gap-4 py-6 min-h-24 transition-colors ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          {spinning ? (
            <span className="text-2xl sm:text-3xl font-extrabold text-muted-foreground animate-pulse">
              ¡No va más!
            </span>
          ) : last ? (
            <>
              <motion.span
                key={`${last.number}-${history.length}`}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`grid size-16 place-items-center rounded-xl border-2 text-2xl font-extrabold text-white ${COLOR_CLASSES[rouletteColor(last.number)]}`}
              >
                {last.number}
              </motion.span>
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
              Elige tu apuesta y gira la ruleta
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
          <div className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Tu apuesta: </span>
            <strong className="text-gold">{resumen}</strong>
          </div>
          <Button
            className="w-full h-12 font-extrabold text-base"
            disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
            onClick={() => void handlePlay()}
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Dices className="size-5" aria-hidden />}
            {busy ? "¡No va más!" : "Girar"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Pagos: pleno <strong className="text-gold">×36</strong> · colores, paridad y mitades{" "}
            <strong className="text-gold">×2</strong> · docenas <strong className="text-gold">×3</strong>.
            El 0 solo paga el pleno.
          </p>
        </div>
      </aside>
    </div>
  );
}
