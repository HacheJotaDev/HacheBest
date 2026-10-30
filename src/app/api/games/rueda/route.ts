import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/rueda — apuesta instantánea de rueda */
export async function POST(req: NextRequest) {
  return handleInstantGame("rueda", req);
}
