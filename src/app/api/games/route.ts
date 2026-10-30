import { listGameConfigs } from "@/lib/db";
import { GAMES, parseConfig } from "@/lib/games";
import {
  betCeiling,
  coveredMaxBet,
  houseBankSnapshot,
  houseIsOpen,
  representativeCeiling,
} from "@/lib/house";

/** GET /api/games — catálogo y configuración pública de los juegos */
export async function GET() {
  try {
    const abierta = houseIsOpen();
    const bank = houseBankSnapshot();
    const games = listGameConfigs().map((cfg) => {
      const cfgObj = parseConfig(cfg.configJson);
      // La banca limita dinámicamente la apuesta máxima: la casa nunca
      // acepta una apuesta cuyo peor premio no pueda pagar.
      const covered = coveredMaxBet(representativeCeiling(cfg.game));
      const maxBet = !abierta
        ? 0
        : Number.isFinite(covered)
          ? Math.min(cfg.maxBet, covered)
          : cfg.maxBet;
      return {
        game: cfg.game,
        name: cfg.name,
        enabled: cfg.enabled && abierta,
        minBet: cfg.minBet,
        maxBet: Math.round(maxBet * 100) / 100,
        configJson: cfg.configJson,
        // Techo real por tipo de apuesta (el servidor lo revalida al jugar)
        techo: Math.round(betCeiling(cfg.game, { cfg: cfgObj }) * 100) / 100,
      };
    });
    return Response.json({
      games,
      total: games.length,
      catalog: GAMES,
      abierta,
      /** Estado de la banca SIN cifras (los fondos son privados del admin) */
      casa: { abierta, cerradaHasta: !abierta && bank.capital > 0 ? "recarga-del-admin" : null },
    });
  } catch (e) {
    console.error("GET /api/games", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
