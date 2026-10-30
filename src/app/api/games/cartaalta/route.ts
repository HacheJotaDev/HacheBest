import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/cartaalta — apuesta instantánea de cartaalta */
export async function POST(req: NextRequest) {
  return handleInstantGame("cartaalta", req);
}
