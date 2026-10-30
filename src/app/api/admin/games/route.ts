import { NextRequest } from "next/server";
import { checkAdmin, unauthorized } from "@/lib/admin";
import { listGameConfigs, refreshFromRemote, settle, updateGameConfig } from "@/lib/db";
import { DEFAULT_GAME_CONFIG, ROUND2, type GameId } from "@/lib/games";

/** GET /api/admin/games — configuración de todos los juegos (con seed) */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    return Response.json({ games: listGameConfigs() });
  } catch (e) {
    console.error("GET /api/admin/games", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** PUT /api/admin/games — actualiza config de un juego */
export async function PUT(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  await refreshFromRemote();
  try {
    return await putInner(req);
  } finally {
    await settle();
  }
}

async function putInner(req: NextRequest): Promise<Response> {
  try {
    const { game, enabled, minBet, maxBet, configJson } = (await req.json()) as {
      game?: string;
      enabled?: boolean;
      minBet?: number;
      maxBet?: number;
      configJson?: string;
    };
    if (!game) return Response.json({ error: "Falta game" }, { status: 400 });
    if (!(game in DEFAULT_GAME_CONFIG)) {
      return Response.json({ error: "Juego desconocido" }, { status: 400 });
    }

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

    const min = minBet !== undefined ? ROUND2(Number(minBet)) : undefined;
    const max = maxBet !== undefined ? ROUND2(Number(maxBet)) : undefined;
    if (min !== undefined && Number.isNaN(min)) return Response.json({ error: "minBet inválido" }, { status: 400 });
    if (max !== undefined && Number.isNaN(max)) return Response.json({ error: "maxBet inválido" }, { status: 400 });
    if (min !== undefined && max !== undefined && min > max) {
      return Response.json({ error: "La apuesta mínima no puede superar la máxima" }, { status: 400 });
    }

    const updated = updateGameConfig(game as GameId, {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(min !== undefined ? { minBet: min } : {}),
      ...(max !== undefined ? { maxBet: max } : {}),
      ...(configJson !== undefined ? { configJson } : {}),
    });
    return Response.json({ game: updated });
  } catch (e) {
    console.error("PUT /api/admin/games", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
