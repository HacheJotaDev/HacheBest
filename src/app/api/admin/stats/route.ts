import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin, unauthorized } from "@/lib/admin";
import { ROUND2 } from "@/lib/games";

/** GET /api/admin/stats — resumen del casino */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const [totalUsers, totalBets, agg, bannedUsers, recentBets] = await Promise.all([
      db.user.count(),
      db.bet.count({ where: { outcome: { not: "pending" } } }),
      db.bet.aggregate({
        where: { outcome: { not: "pending" } },
        _sum: { amount: true, payout: true, profit: true },
        _avg: { amount: true },
      }),
      db.user.count({ where: { isBanned: true } }),
      db.bet.findMany({
        where: { outcome: "win" },
        orderBy: { profit: "desc" },
        take: 10,
        include: { user: { select: { username: true } } },
      }),
    ]);

    return Response.json({
      stats: {
        totalUsers,
        bannedUsers,
        totalBets,
        totalWagered: ROUND2(agg._sum.amount ?? 0),
        totalPayout: ROUND2(agg._sum.payout ?? 0),
        houseProfit: ROUND2((agg._sum.profit ?? 0) * -1), // la casa gana lo que los jugadores pierden
        avgBet: ROUND2(agg._avg.amount ?? 0),
      },
      bigWins: recentBets.map((b) => ({
        id: b.id,
        username: b.user.username,
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
