import { NextRequest } from "next/server";
import { checkAdmin, unauthorized } from "@/lib/admin";
import { aggregateBets, listUsers, topWins } from "@/lib/db";
import { ROUND2 } from "@/lib/games";

/** GET /api/admin/stats — resumen del casino */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const agg = aggregateBets();
    const users = listUsers(500);
    const activeUsers = users.filter((u) => !u.isBanned);

    return Response.json({
      stats: {
        totalUsers: users.length,
        bannedUsers: users.filter((u) => u.isBanned).length,
        activeUsers: activeUsers.length,
        totalBets: agg.count,
        totalWagered: ROUND2(agg.sumAmount),
        totalPayout: ROUND2(agg.sumPayout),
        houseProfit: ROUND2(agg.sumProfit * -1), // la casa gana lo que los jugadores pierden
        avgBet: ROUND2(agg.avgAmount),
      },
      bigWins: topWins(10).map((b) => ({
        id: b.id,
        username: b.username,
        game: b.game,
        amount: ROUND2(b.amount),
        profit: ROUND2(b.profit),
        multiplier: b.multiplier,
        createdAt: b.createdAt,
      })),
    });
  } catch (e) {
    console.error("GET /api/admin/stats", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
