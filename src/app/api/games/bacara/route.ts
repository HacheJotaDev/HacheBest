import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/bacara — apuesta instantánea de bacará (jugador | banca | empate) */
export async function POST(req: NextRequest) {
  return handleInstantGame("bacara", req);
}
