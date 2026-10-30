import type { NextRequest } from "next/server";
import { handleTictactoe } from "@/lib/game-handlers";

/** POST /api/games/tictactoe — partida de 3 en raya (action: start | settle) */
export async function POST(req: NextRequest) {
  return handleTictactoe(req);
}
