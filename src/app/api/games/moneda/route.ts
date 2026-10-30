import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/moneda — apuesta instantánea de moneda */
export async function POST(req: NextRequest) {
  return handleInstantGame("moneda", req);
}
