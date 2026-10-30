"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpDown,
  Binary,
  Bomb,
  CircleDot,
  Coins,
  FerrisWheel,
  Grid3x3,
  Hand,
  Spade,
  Swords,
  Target,
  TrendingUp,
  Triangle,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCasino } from "@/store/casino";
import { fmtUSD } from "@/lib/client";

const GAME_META: Record<string, { icon: React.ElementType; tint: string; maxWin: string }> = {
  parimpar: { icon: Binary, tint: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", maxWin: "×1,95" },
  exacto: { icon: Target, tint: "text-red-400 bg-red-500/10 border-red-500/30", maxWin: "×36" },
  moneda: { icon: Coins, tint: "text-gold bg-amber-500/10 border-amber-500/30", maxWin: "×1,95" },
  dado: { icon: Hand, tint: "text-violet-400 bg-violet-500/10 border-violet-500/30", maxWin: "×49,5" },
  tictactoe: { icon: Grid3x3, tint: "text-sky-400 bg-sky-500/10 border-sky-500/30", maxWin: "×2,5" },
  ppt: { icon: Coins, tint: "text-orange-400 bg-orange-500/10 border-orange-500/30", maxWin: "×2,9" },
  ruleta: { icon: CircleDot, tint: "text-red-400 bg-red-500/10 border-red-500/30", maxWin: "×36" },
  tragamonedas: { icon: Coins, tint: "text-pink-400 bg-pink-500/10 border-pink-500/30", maxWin: "×50" },
  rueda: { icon: FerrisWheel, tint: "text-gold bg-amber-500/10 border-amber-500/30", maxWin: "×5" },
  plinko: { icon: Triangle, tint: "text-lime-400 bg-lime-500/10 border-lime-500/30", maxWin: "×170" },
  cartaalta: { icon: Swords, tint: "text-rose-400 bg-rose-500/10 border-rose-500/30", maxWin: "×2,05" },
  mayormenor: { icon: ArrowUpDown, tint: "text-teal-400 bg-teal-500/10 border-teal-500/30", maxWin: "×12,87" },
  blackjack: { icon: Spade, tint: "text-zinc-200 bg-zinc-500/10 border-zinc-400/30", maxWin: "×2,5" },
  mines: { icon: Bomb, tint: "text-orange-400 bg-orange-500/10 border-orange-500/30", maxWin: "×24,75" },
  crash: { icon: TrendingUp, tint: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", maxWin: "×5000" },
};

/** Lobby con las tarjetas de todos los juegos */
export function Lobby() {
  const gamesConfig = useCasino((s) => s.gamesConfig);
  const setActiveGame = useCasino((s) => s.setActiveGame);
  const ordered = [
    "crash",
    "mines",
    "blackjack",
    "ruleta",
    "plinko",
    "tragamonedas",
    "mayormenor",
    "rueda",
    "cartaalta",
    "parimpar",
    "exacto",
    "moneda",
    "dado",
    "tictactoe",
    "ppt",
  ]
    .map((g) => gamesConfig.find((c) => c.game === g))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-5">
        <h2 className="text-2xl font-extrabold tracking-tight">Sala de juegos</h2>
        <p className="text-sm text-muted-foreground">
          Elige tu juego favorito y haz tu apuesta. Todos los resultados se generan de forma
          segura en el servidor.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ordered.map((g, i) => {
          const meta = GAME_META[g.game] ?? GAME_META.ppt;
          const Icon = meta.icon;
          return (
            <motion.button
              key={g.game}
              type="button"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              disabled={!g.enabled}
              onClick={() => setActiveGame(g.game)}
              className={`casino-card group relative p-5 text-left transition-colors ${
                g.enabled ? "hover:border-gold/50 cursor-pointer" : "opacity-60 cursor-not-allowed"
              }`}
              aria-label={`Jugar a ${g.name}`}
            >
              <div className="flex items-start justify-between">
                <span className={`grid place-items-center size-12 rounded-xl border ${meta.tint}`}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <div className="flex flex-col items-end gap-1.5">
                  {g.enabled ? (
                    <Badge variant="outline" className="border-gold/40 text-gold font-bold">
                      Gana hasta {meta.maxWin}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-border text-muted-foreground gap-1">
                      <MaintenanceBadge />
                    </Badge>
                  )}
                </div>
              </div>
              <h3 className="mt-4 text-lg font-bold">{g.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {DESCS[g.game]}
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Límites: <strong className="text-foreground">{fmtUSD(g.minBet)}</strong> –{" "}
                  <strong className="text-foreground">{fmtUSD(g.maxBet)}</strong>
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Jugar <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function MaintenanceBadge() {
  return (
    <Badge variant="outline" className="border-border text-muted-foreground gap-1">
      <Wrench className="size-3" aria-hidden /> Mantenimiento
    </Badge>
  );
}

const DESCS: Record<string, string> = {
  parimpar: "¿Par o impar? Un número del 0 al 99 decide tu destino.",
  exacto: "Elige un número de la ruleta 0-36. Acertar paga 36 veces tu apuesta.",
  moneda: "Cara o cruz al aire. Un clásico de la suerte al 50%.",
  dado: "Ajusta tu objetivo y tu riesgo: mayor o menor que la tirada.",
  tictactoe: "Duelo contra la IA en 3 en raya con apuesta: ganar paga, empatar devuelve.",
  ppt: "Piedra, papel o tijera contra la casa. El empate devuelve tu apuesta.",
  ruleta: "Ruleta europea con plenos, colores, paridades, mitades y docenas.",
  tragamonedas: "Tres rodillos de la suerte: el 7 seguido paga hasta 50 veces.",
  rueda: "26 segmentos: quiebra, premios pequeños… y un 5x escondido.",
  plinko: "Deja caer la bola entre los pinchos: los bordes pagan fortunas.",
  cartaalta: "Tu carta contra la de la casa. La más alta se lleva el premio.",
  mayormenor: "Cadena de cartas: mayor o igual, menor o igual… retírate cuando quieras.",
  blackjack: "Llega a 21 y vence al crupier. Doblar, pedir o plantarse.",
  mines: "Revela gemas esquivando las minas y retírate antes de explotar.",
  crash: "El multiplicador sube sin parar… retírate antes del crash.",
};
