"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Loader2, Play, Swords, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { BetInput } from "../bet-input";
import { delay, toastResult } from "./shared";
import { PlayingCard } from "./playing-card";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

const CARD_RE = /^(?:A|2|3|4|5|6|7|8|9|10|J|Q|K)[♠♥♦♣]$/;

function isCard(v: unknown): v is string {
  return typeof v === "string" && CARD_RE.test(v);
}

/** CARTA MÁS ALTA — tu carta contra la de la casa: la más alta gana (×2,05) · empate devuelve */
export function CartaAltaGame() {
  const play = useCasino((s) => s.play);
  const user = useCasino((s) => s.user);
  const cfg = useCasino((s) => s.gamesConfig.find((g) => g.game === "cartaalta"));
  const min = cfg?.minBet ?? 1;
  const max = cfg?.maxBet ?? 500;

  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [playerCard, setPlayerCard] = useState<string | null>(null);
  const [houseCard, setHouseCard] = useState<string | null>(null);
  const [last, setLast] = useState<{ outcome: string; profit: number } | null>(null);
  const [history, setHistory] = useState<{ id: number; outcome: string }[]>([]);
  const idRef = useRef(0);

  const disabled = busy || !user;
  const won = last?.outcome === "win";
  const lost = last?.outcome === "lose";
  const draw = last?.outcome === "draw";

  async function handleDeal() {
    setBusy(true);
    setLast(null);
    setPlayerCard(null);
    setHouseCard(null);

    const [res] = await Promise.all([play("cartaalta", "jugar", amount), delay(1100)]);

    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }

    const player = res.data.result.player;
    const house = res.data.result.house;
    if (!isCard(player) || !isCard(house)) {
      setBusy(false);
      toast.error("Respuesta inválida del servidor");
      return;
    }

    const r = res.data;
    setPlayerCard(player);
    setHouseCard(house);
    setLast({ outcome: r.outcome, profit: r.profit });
    const entry = { id: ++idRef.current, outcome: r.outcome };
    setHistory((h) => [entry, ...h].slice(0, 10));
    toastResult(r.outcome, r.profit);
    setBusy(false);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      {/* Zona de juego */}
      <div className="space-y-4">
        {/* Duelo */}
        <div
          className={`casino-card relative flex items-center justify-center gap-6 py-10 sm:gap-12 transition-colors ${
            won ? "border-win/60 bg-win/5" : lost ? "border-lose/50 bg-lose/5" : ""
          }`}
          aria-live="polite"
        >
          {/* Tu carta */}
          <div className="flex flex-col items-center gap-3">
            <div className="[perspective:600px]">
              <motion.div
                key={playerCard ?? "player-hidden"}
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                <PlayingCard card={playerCard} size="lg" />
              </motion.div>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <User className="size-3.5" aria-hidden /> Tú
            </span>
          </div>

          {/* Enfrentamiento */}
          <div
            className="grid size-12 sm:size-14 shrink-0 place-items-center rounded-full border-2 border-gold/70 bg-background shadow-[0_0_20px_rgba(212,175,55,0.25)]"
            aria-hidden
          >
            <Swords className="size-5 sm:size-6 text-gold" />
          </div>

          {/* Carta de la casa */}
          <div className="flex flex-col items-center gap-3">
            <div className="[perspective:600px]">
              <motion.div
                key={houseCard ?? "house-hidden"}
                initial={{ rotateY: 90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.25 }}
              >
                <PlayingCard card={houseCard} size="lg" />
              </motion.div>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
              <Bot className="size-3.5" aria-hidden /> La casa
            </span>
          </div>
        </div>

        {/* Resultado */}
        <div
          className={`casino-card flex min-h-14 items-center justify-center py-4 text-center text-sm font-bold transition-colors ${
            won ? "text-win" : lost ? "text-lose" : draw ? "text-foreground" : "text-muted-foreground"
          }`}
          aria-live="polite"
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Repartiendo…
            </span>
          ) : last && playerCard && houseCard ? (
            won ? (
              <span>
                ¡Tu {playerCard} vence al {houseCard}!{" "}
                <span className="text-gold">+{fmtUSD(last.profit)}</span>
              </span>
            ) : lost ? (
              <span>La {houseCard} de la casa vence a tu {playerCard}</span>
            ) : (
              <span>Empate: apuesta devuelta</span>
            )
          ) : (
            <span>Reparte cartas y desafía a la casa</span>
          )}
        </div>

        {/* Historial */}
        {history.length > 0 && (
          <div className="casino-card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Últimas manos
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {history.map((h) => (
                <span
                  key={h.id}
                  title={h.outcome === "win" ? "Ganada" : h.outcome === "lose" ? "Perdida" : "Empate"}
                  aria-label={
                    h.outcome === "win"
                      ? "Mano ganada"
                      : h.outcome === "lose"
                        ? "Mano perdida"
                        : "Empate"
                  }
                  className={`size-2.5 rounded-full ${
                    h.outcome === "win" ? "bg-win" : h.outcome === "lose" ? "bg-lose" : "bg-zinc-600"
                  }`}
                />
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
            label="Apuesta por mano"
          />
          <Button
            className="w-full h-12 font-extrabold text-base"
            disabled={disabled || amount > (user?.balance ?? 0) || amount < min}
            onClick={() => void handleDeal()}
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Play className="size-5" aria-hidden />
            )}
            {busy ? "Repartiendo…" : "Repartir cartas"}
          </Button>
          <p className="text-xs text-muted-foreground">
            La más alta gana (A es la más baja). Empate devuelve. Premio{" "}
            <strong className="text-gold">×2,05</strong>.
          </p>
        </div>
      </aside>
    </div>
  );
}
