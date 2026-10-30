import type { NextRequest } from "next/server";
import { handleSessionGame } from "@/lib/game-handlers";

/** POST /api/games/mayormenor — partida multi-fase de mayormenor (action: start | act) */
export async function POST(req: NextRequest) {
  return handleSessionGame("mayormenor", req);
}
