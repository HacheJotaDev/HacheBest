import { db } from "@/lib/db";
import { GAMES, getGameConfig, type GameId } from "@/lib/games";

/** GET /api/games — configuración pública de los juegos */
export async function GET() {
  try {
    const games = await Promise.all(
      (GAMES as readonly GameId[]).map(async (g) => {
        const cfg = await getGameConfig(g);
        return {
          game: cfg.game,
          name: cfg.name,
          enabled: cfg.enabled,
          minBet: cfg.minBet,
          maxBet: cfg.maxBet,
          configJson: cfg.configJson,
        };
      }),
    );
    return Response.json({ games });
  } catch (e) {
    console.error("GET /api/games", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
