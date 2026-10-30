import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/plinko — apuesta instantánea de plinko */
export async function POST(req: NextRequest) {
  return handleInstantGame("plinko", req);
}
