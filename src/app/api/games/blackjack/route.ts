import type { NextRequest } from "next/server";
import { handleSessionGame } from "@/lib/game-handlers";

/** POST /api/games/blackjack — partida multi-fase de blackjack (action: start | act) */
export async function POST(req: NextRequest) {
  return handleSessionGame("blackjack", req);
}
