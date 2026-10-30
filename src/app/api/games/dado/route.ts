import type { NextRequest } from "next/server";
import { handleInstantGame } from "@/lib/game-handlers";

/** POST /api/games/dado — apuesta instantánea de dado */
export async function POST(req: NextRequest) {
  return handleInstantGame("dado", req);
}
