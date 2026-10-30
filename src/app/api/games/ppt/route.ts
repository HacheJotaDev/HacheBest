import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/ppt — apuesta instantánea de ppt */
export async function POST(req: NextRequest) {
  return handleInstantGame("ppt", req);
}
