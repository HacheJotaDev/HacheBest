import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin, unauthorized } from "@/lib/admin";
import { GAMES, getGameConfig, ROUND2, type GameId } from "@/lib/games";

/** GET /api/admin/games — configuración de todos los juegos (con seed) */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const games = await Promise.all(
      (GAMES as readonly GameId[]).map((g) => getGameConfig(g)),
    );
    return Response.json({ games });
  } catch (e) {
    console.error("GET /api/admin/games", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** PUT /api/admin/games — actualiza config de un juego */
export async function PUT(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const { game, enabled, minBet, maxBet, configJson } = (await req.json()) as {
      game?: string;
      enabled?: boolean;
      minBet?: number;
      maxBet?: number;
      configJson?: string;
    };
    if (!game) return Response.json({ error: "Falta game" }, { status: 400 });

    // Valida configJson si viene
    if (configJson !== undefined) {
      try {
        const parsed = JSON.parse(configJson) as Record<string, unknown>;
        for (const v of Object.values(parsed)) {
          if (typeof v !== "number" && typeof v !== "boolean") {
            throw new Error("bad");
          }
        }
      } catch {
        return Response.json({ error: "configJson inválido (solo números y booleanos)" }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if (enabled !== undefined) data.enabled = enabled;
    if (minBet !== undefined) data.minBet = ROUND2(Number(minBet));
    if (maxBet !== undefined) data.maxBet = ROUND2(Number(maxBet));
    if (configJson !== undefined) data.configJson = configJson;

    if (data.minBet !== undefined && data.maxBet !== undefined && Number(data.minBet) > Number(data.maxBet)) {
      return Response.json({ error: "La apuesta mínima no puede superar la máxima" }, { status: 400 });
    }

    const updated = await db.gameConfig.upsert({
      where: { game },
      update: data,
      create: { game, name: game, ...data },
    });
    return Response.json({ game: updated });
  } catch (e) {
    console.error("PUT /api/admin/games", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
