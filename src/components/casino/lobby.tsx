"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Binary,
  Coins,
  Grid3x3,
  Hand,
  Target,
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
};

/** Lobby con las tarjetas de todos los juegos */
export function Lobby() {
  const gamesConfig = useCasino((s) => s.gamesConfig);
  const setActiveGame = useCasino((s) => s.setActiveGame);
  const ordered = ["parimpar", "exacto", "moneda", "dado", "tictactoe", "ppt"]
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
};
