import type { NextRequest } from "next/server";
import { handleSessionGame } from "@/lib/game-handlers";

/** POST /api/games/mines — partida multi-fase de mines (action: start | act) */
export async function POST(req: NextRequest) {
  return handleSessionGame("mines", req);
}
