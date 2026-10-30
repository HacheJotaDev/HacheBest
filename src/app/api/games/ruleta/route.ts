import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/ruleta — apuesta instantánea de ruleta */
export async function POST(req: NextRequest) {
  return handleInstantGame("ruleta", req);
}
