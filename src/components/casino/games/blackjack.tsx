"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Coins, Hand, Loader2, Plus, RotateCcw, Spade } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { PlayingCard } from "./playing-card";
import { toastResult } from "./shared";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────
// Blackjack contra el crupier (juego de sesión)
// Natural paga ×2,50 · victoria normal ×2 · empate devuelve
// ─────────────────────────────────────────────────────────────

type Phase = "idle" | "playing" | "finished";

/** Estado público que envía el servidor (publicBJ) */
interface BJState {
  player: string[];
  dealer: string[];
  dealerHidden: boolean;
  doubled: boolean;
  playerTotal: number;
  canDouble: boolean;
}

/** resultJson de la liquidación de la mano */
type BJResult = {
  player?: string[];
  dealer?: string[];
  playerTotal?: number;
  dealerTotal?: number;
  reason?: string;
};

interface BJFinal {
  outcome: string;
  profit: number;
  result: BJResult;
}

const reasonLabels: Record<string, string> = {
  blackjack: "¡BLACKJACK!",
  "crupier-pasado": "El crupier se pasó",
  mayor: "Tu mano gana",
  "blackjack-crupier": "Blackjack del crupier",
  pasado: "Te pasaste de 21",
  "pasado-al-doblar": "Te pasaste al doblar",
  "crupier-gana": "El crupier gana",
  "dos-blackjacks": "Dos blackjacks",
  empate: "Empate",
};

/** Fila de cartas con animación de entrada; "?" se renderiza como dorso */
function HandRow({ cards, label }: { cards: string[]; label: string }) {
  return (
    <div className="flex min-h-24 flex-wrap gap-2" aria-label={label}>
      {cards.map((card, i) => (
        <motion.div
          key={`${card}-${i}`}
          initial={{ y: -14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
        >
          <PlayingCard card={card} hidden={card === "?"} size="md" />
        </motion.div>
      ))}
    </div>
  );
}

/** BLACKJACK — sesión multironda: repartir, pedir, plantarse o doblar */
export function BlackjackGame() {
  const sessionStart = useCasino((s) => s.sessionStart);
  const sessionAct = useCasino((s) => s.sessionAct);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "blackjack"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [phase, setPhase] = useState<Phase>("idle");
  const [amount, setAmount] = useState(10);
  const [betId, setBetId] = useState<string | null>(null);
  const [bj, setBj] = useState<BJState | null>(null);
  const [final, setFinal] = useState<BJFinal | null>(null);
  const [busy, setBusy] = useState(false);

  const disabled = busy || !user;

  async function deal() {
    setBusy(true);
    setFinal(null);
    const res = await sessionStart("blackjack", amount);
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    // Naturals: la mano se liquidó al repartir (blackjack, doble blackjack…)
    if (res.data.settled) {
      const s = res.data.settled;
      setFinal({ outcome: s.outcome, profit: s.profit, result: s.result as unknown as BJResult });
      toastResult(s.outcome, s.profit);
      setPhase("finished");
      setBusy(false);
      return;
    }
    const st = res.data.state as unknown as BJState | undefined;
    if (!st) {
      setBusy(false);
      toast.error("No se pudo repartir la mano");
      return;
    }
    setBetId(res.data.betId);
    setBj(st);
    setPhase("playing");
    setBusy(false);
  }

  async function act(action: "hit" | "stand" | "double") {
    if (!betId || busy) return;
    setBusy(true);
    const res = await sessionAct("blackjack", betId, action);
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    if (res.data.settled) {
      setFinal({
        outcome: res.data.outcome ?? "lose",
        profit: res.data.profit ?? 0,
        result: (res.data.result ?? {}) as unknown as BJResult,
      });
      toastResult(res.data.outcome ?? "lose", res.data.profit ?? 0);
      setPhase("finished");
    } else if (res.data.state) {
      setBj(res.data.state as unknown as BJState);
    }
    setBusy(false);
  }

  function reset() {
    setPhase("idle");
    setBj(null);
    setFinal(null);
    setBetId(null);
  }

  const won = final?.outcome === "win";
  const draw = final?.outcome === "draw";
  const lost = final?.outcome === "lose";
  const reasonText = final?.result.reason ? reasonLabels[final.result.reason] : undefined;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Mesa */}
      <div className="space-y-4">
        <div
          className={`casino-card flex min-h-[360px] flex-col p-4 sm:p-6 ${
            phase === "finished" && won
              ? "border-win/60 bg-win/5"
              : phase === "finished" && lost
                ? "border-lose/50 bg-lose/5"
                : ""
          }`}
        >
          {phase === "idle" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
              <Spade className="size-10 text-gold" aria-hidden />
              <p className="text-xl font-extrabold">Blackjack</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Llega a 21 o acércate más que el crupier sin pasarte. Con dos cartas puedes pedir,
                plantarte o doblar tu apuesta.
              </p>
            </div>
          ) : (
            <>
              {/* Crupier */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Crupier
                  </span>
                  {phase === "finished" && final && (
                    <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-gold">
                      {final.result.dealerTotal ?? 0}
                    </span>
                  )}
                </div>
                <HandRow
                  cards={phase === "finished" && final ? (final.result.dealer ?? []) : (bj?.dealer ?? [])}
                  label="Cartas del crupier"
                />
              </div>

              <div className="my-5 h-px bg-border/60" aria-hidden />

              {/* Jugador */}
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Tú
                  </span>
                  <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-gold">
                    {phase === "finished" && final ? (final.result.playerTotal ?? 0) : (bj?.playerTotal ?? 0)}
                  </span>
                  {phase === "playing" && bj?.doubled && (
                    <Badge className="border-gold/40 bg-gold/10 text-gold">Doblate ×2</Badge>
                  )}
                </div>
                <HandRow
                  cards={phase === "finished" && final ? (final.result.player ?? []) : (bj?.player ?? [])}
                  label="Tus cartas"
                />
              </div>

              {/* Resultado */}
              {phase === "finished" && final && (
                <div
                  className={`mt-5 rounded-lg border p-3 text-center ${
                    won
                      ? "border-win/40 bg-win/10"
                      : draw
                        ? "border-border bg-background/50"
                        : "border-lose/40 bg-lose/10"
                  }`}
                  aria-live="polite"
                >
                  {won && (
                    <>
                      <p className="text-lg font-extrabold text-win">+{fmtUSD(final.profit)}</p>
                      {reasonText && <p className="mt-0.5 text-xs font-bold text-win">{reasonText}</p>}
                    </>
                  )}
                  {draw && (
                    <>
                      <p className="text-lg font-extrabold">Empate: apuesta devuelta</p>
                      {final.result.reason === "dos-blackjacks" && reasonText && (
                        <p className="mt-0.5 text-xs font-bold text-muted-foreground">{reasonText}</p>
                      )}
                    </>
                  )}
                  {lost && <p className="text-lg font-extrabold text-lose">{reasonText ?? "Mano perdida"}</p>}
                </div>
              )}
            </>
          )}
        </div>

        {/* Acciones de la mano */}
        {phase === "playing" && bj && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant="secondary" className="h-12 font-extrabold" disabled={disabled} onClick={() => void act("hit")}>
              <Plus className="size-5" aria-hidden /> Pedir
            </Button>
            <Button variant="secondary" className="h-12 font-extrabold" disabled={disabled} onClick={() => void act("stand")}>
              <Hand className="size-5" aria-hidden /> Plantarse
            </Button>
            <Button
              variant="outline"
              className="h-12 border-gold/50 font-extrabold text-gold hover:bg-gold/10"
              disabled={disabled || !bj.canDouble || amount > (user?.balance ?? 0)}
              onClick={() => void act("double")}
            >
              <Coins className="size-5" aria-hidden /> Doblar
            </Button>
          </div>
        )}
      </div>

      {/* Controles de apuesta */}
      <aside className="space-y-4">
        {phase === "idle" && (
          <>
            <div className="casino-card space-y-4 p-4">
              <BetInput
                value={amount}
                onChange={setAmount}
                min={min}
                max={max}
                balance={user?.balance ?? 0}
                disabled={disabled}
                label="Apuesta por mano"
              />
              <Button
                className="h-12 w-full text-base font-extrabold"
                disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
                onClick={() => void deal()}
              >
                {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Spade className="size-5" aria-hidden />}
                {busy ? "Repartiendo…" : "Repartir"}
              </Button>
            </div>
            <div className="casino-card p-4 text-xs text-muted-foreground">
              Blackjack natural paga <strong className="text-gold">×2,50</strong> · victoria normal{" "}
              <strong className="text-gold">×2</strong> · empate devuelve la apuesta · el crupier se
              planta en 17
            </div>
          </>
        )}

        {phase === "playing" && (
          <div className="casino-card space-y-3 p-4">
            <p className="text-sm font-bold">Mano en curso</p>
            <p className="text-xs text-muted-foreground">
              {fmtUSD(bj?.doubled ? amount * 2 : amount)} en juego. Doblar cuesta otra{" "}
              {fmtUSD(amount)} y solo está disponible con las dos primeras cartas.
            </p>
          </div>
        )}

        {phase === "finished" && (
          <div className="casino-card space-y-4 p-4">
            <Button className="h-12 w-full font-extrabold" onClick={reset}>
              <RotateCcw className="size-5" aria-hidden /> Nueva mano
            </Button>
            <p className="text-xs text-muted-foreground">¿Otra? Vuelve a repartir cuando quieras.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
