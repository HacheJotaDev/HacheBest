import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/exacto — apuesta instantánea de exacto */
export async function POST(req: NextRequest) {
  return handleInstantGame("exacto", req);
}
