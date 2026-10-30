import { listGameConfigs } from "@/lib/db";
import { GAMES, type GameId } from "@/lib/games";

/** GET /api/games — catálogo y configuración pública de los juegos */
export async function GET() {
  try {
    const games = listGameConfigs().map((cfg) => ({
      game: cfg.game,
      name: cfg.name,
      enabled: cfg.enabled,
      minBet: cfg.minBet,
      maxBet: cfg.maxBet,
      configJson: cfg.configJson,
    }));
    return Response.json({
      games,
      total: games.length,
      catalog: GAMES,
    });
  } catch (e) {
    console.error("GET /api/games", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
