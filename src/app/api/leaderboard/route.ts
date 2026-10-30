import { db } from "@/lib/db";
import { ROUND2 } from "@/lib/games";

/** GET /api/leaderboard — top 10 por saldo (solo usuarios con apuestas) */
export async function GET() {
  try {
    const users = await db.user.findMany({
      where: { betsCount: { gt: 0 }, isBanned: false },
      orderBy: [{ balance: "desc" }, { totalWagered: "desc" }],
      take: 10,
      select: {
        id: true,
        username: true,
        balance: true,
        totalWagered: true,
        betsCount: true,
        winsCount: true,
      },
    });
    return Response.json({
      users: users.map((u) => ({ ...u, balance: ROUND2(u.balance), totalWagered: ROUND2(u.totalWagered) })),
    });
  } catch (e) {
    console.error("GET /api/leaderboard", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
