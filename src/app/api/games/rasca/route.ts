import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/rasca — apuesta instantánea de rasca y gana (tarjeta 3×3) */
export async function POST(req: NextRequest) {
  return handleInstantGame("rasca", req);
}
