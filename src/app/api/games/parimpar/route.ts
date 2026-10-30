import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/parimpar — apuesta instantánea de parimpar */
export async function POST(req: NextRequest) {
  return handleInstantGame("parimpar", req);
}
