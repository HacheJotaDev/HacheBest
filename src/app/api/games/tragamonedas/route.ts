import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/tragamonedas — apuesta instantánea de tragamonedas */
export async function POST(req: NextRequest) {
  return handleInstantGame("tragamonedas", req);
}
