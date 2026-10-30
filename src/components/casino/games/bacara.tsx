"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Club, Loader2, Play, RotateCcw, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { PlayingCard } from "./playing-card";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────
// BACARÁ — el clásico de los casinos. Apuestas a Jugador (×2),
// Banca (×1,95) o Empate (×9). El crupier respeta la regla de la
// tercera carta y las cifras se leen en módulo 10.
// ─────────────────────────────────────────────────────────────

type Choice = "jugador" | "banca" | "empate";

const CHOICES: { id: Choice; label: string; pay: string; hint: string }[] = [
  { id: "jugador", label: "Jugador", pay: "×2", hint: "La mano del jugador acaba más alta" },
  { id: "banca", label: "Banca", pay: "×1,95", hint: "La apuesta favorita del casino" },
  { id: "empate", label: "Empate", pay: "×9", hint: "Ambas manos empatan y pagamos 9×" },
];

const WINNER_LABEL: Record<Choice, string> = {
  jugador: "¡Gana el Jugador!",
  banca: "Gana la Banca",
  empate: "Empate",
};

interface BacaraResult {
  player: string[];
  banker: string[];
  playerTotal: number;
  bankerTotal: number;
  winner: Choice;
  natural: boolean;
}

function CardRow({ cards, title, total, tone }: { cards: string[]; title: string; total: number; tone: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
        <span
          className={`grid h-7 min-w-7 place-items-center rounded-full border px-2 text-xs font-black tabular-nums ${tone}`}
          aria-label={`Total ${title}: ${total}`}
        >
          {total}
        </span>
      </div>
      <div className="flex min-h-24 items-center gap-1.5 sm:min-h-28">
        {cards.map((c, i) => (
          <motion.div
            key={`${c}-${i}`}
            initial={{ opacity: 0, y: -18, rotate: -8 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: i * 0.18, duration: 0.3, type: "spring", bounce: 0.4 }}
          >
            <PlayingCard card={c} size="md" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** BACARÁ — apuesta a una de las tres manos y el crupier reparte */
export function BacaraGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "bacara"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [choice, setChoice] = useState<Choice | null>(null);
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [dealt, setDealt] = useState<BacaraResult | null>(null);
  const [last, setLast] = useState<{ outcome: string; profit: number } | null>(null);

  const disabled = busy || !user;

  async function handlePlay() {
    if (!choice || disabled) return;
    setBusy(true);
    setDealt(null);
    setLast(null);

    const [res] = await Promise.all([play("bacara", choice, amount), delay(700)]);
    if (!res.ok) {
      toast.error(res.error);
      setBusy(false);
      return;
    }
    setDealt(res.data.result as unknown as BacaraResult);
    setLast({ outcome: res.data.outcome, profit: res.data.profit });
    toastResult(res.data.outcome, res.data.profit);
    setBusy(false);
  }

  function reset() {
    setDealt(null);
    setLast(null);
    setChoice(null);
  }

  const won = last?.outcome === "win";
  const draw = last?.outcome === "draw";
  const lost = last?.outcome === "lose";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {/* Apuestas */}
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Elige tu apuesta">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={choice === c.id}
              disabled={disabled}
              onClick={() => setChoice(c.id)}
              className={`casino-card p-3 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4 ${
                choice === c.id
                  ? "border-gold ring-2 ring-gold/60 bg-gold/5"
                  : "hover:border-gold/40 hover:bg-accent/40"
              }`}
            >
              <span className="block text-lg font-extrabold">{c.label}</span>
              <span className="mt-0.5 block text-xl font-black text-gold">{c.pay}</span>
              <span className="mt-1 hidden text-[11px] leading-tight text-muted-foreground sm:block">
                {c.hint}
              </span>
            </button>
          ))}
        </div>

        {/* Mesa */}
        <div
          className={`casino-card flex min-h-64 flex-col items-center justify-center gap-5 p-4 sm:p-6 ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          {dealt ? (
            <>
              <div className="flex w-full flex-col items-center justify-center gap-5 sm:flex-row sm:gap-10">
                <CardRow cards={dealt.player} title="Jugador" total={dealt.playerTotal} tone="border-emerald-500/40 bg-emerald-500/10 text-emerald-400" />
                <span className="text-2xl font-black text-muted-foreground/40" aria-hidden>
                  VS
                </span>
                <CardRow cards={dealt.banker} title="Banca" total={dealt.bankerTotal} tone="border-red-500/40 bg-red-500/10 text-red-400" />
              </div>
              {dealt.natural && (
                <Badge className="border-gold/50 bg-gold/10 text-gold" variant="outline">
                  🎉 Natural — no hay tercera carta
                </Badge>
              )}
              {!busy && (
                <motion.p
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`text-lg font-extrabold ${won ? "text-win" : lost ? "text-lose" : "text-foreground"}`}
                >
                  {WINNER_LABEL[dealt.winner]}
                  {won && ` +${fmtUSD(last?.profit ?? 0)}`}
                  {draw && " · tu apuesta vuelve a tu bolsillo"}
                </motion.p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="grid size-14 place-items-center rounded-2xl border border-gold/30 bg-gold/10">
                <Club className="size-7 text-gold" aria-hidden />
              </span>
              <p className="text-xl font-extrabold">Bacará</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Elige tu apuesta arriba y el crupier reparta las cartas. Gana la mano que se acerque
                más a 9.
              </p>
              {busy && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Repartiendo…
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="casino-card space-y-4 p-4">
          <BetInput
            value={amount}
            onChange={setAmount}
            min={min}
            max={max}
            balance={user?.balance ?? 0}
            disabled={disabled}
            label="Importe por mano"
          />
          <Button
            className="h-12 w-full text-base font-extrabold"
            disabled={disabled || !choice || amount > (user?.balance ?? 0)}
            onClick={() => void handlePlay()}
          >
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Play className="size-5" aria-hidden />}
            {busy ? "Repartiendo…" : "Repartir cartas"}
          </Button>
          {!busy && dealt && (
            <Button variant="secondary" className="w-full" onClick={reset}>
              <RotateCcw className="size-4" aria-hidden /> Nueva mano
            </Button>
          )}
          <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-xs text-muted-foreground space-y-1.5">
            <p className="flex items-center gap-1.5 font-bold text-foreground">
              <ScrollText className="size-3.5" aria-hidden /> Reglas
            </p>
            <p>Las figuras y el 10 valen 0 · el as vale 1. La mano más cercana a 9 gana.</p>
            <p>
              Jugador paga <strong className="text-gold">×2</strong> · Banca{" "}
              <strong className="text-gold">×1,95</strong> · Empate{" "}
              <strong className="text-gold">×9</strong>.
            </p>
            <p>Si empatan y apostaste a Jugador o Banca, recuperas tu apuesta.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
