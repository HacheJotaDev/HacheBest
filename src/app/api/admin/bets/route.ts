import { NextRequest } from "next/server";
import { checkAdmin, unauthorized } from "@/lib/admin";
import { listRecentBets } from "@/lib/db";
import { DEFAULT_GAME_CONFIG, ROUND2, type GameId } from "@/lib/games";

/** GET /api/admin/bets?limit=50 — últimas apuestas globales (feed del panel) */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50, 200);
    const bets = listRecentBets(limit);
    return Response.json({
      bets: bets.map((b) => ({
        id: b.id,
        game: b.game,
        gameName: DEFAULT_GAME_CONFIG[b.game as GameId]?.name ?? b.game,
        betType: b.betType,
        amount: ROUND2(b.amount),
        multiplier: b.multiplier,
        payout: ROUND2(b.payout),
        profit: ROUND2(b.profit),
        outcome: b.outcome,
        createdAt: b.createdAt,
      })),
    });
  } catch (e) {
    console.error("GET /api/admin/bets", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
