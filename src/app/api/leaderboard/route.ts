import { ensureHydrated, listUsers } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ROUND2 } from "@/lib/games";

/** GET /api/leaderboard — top 10 por saldo (solo usuarios con apuestas, con sesión) */
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.error;
    await ensureHydrated();
    const users = listUsers(500)
      .filter((u) => u.betsCount > 0 && !u.isBanned)
      .sort((a, b) => b.balance - a.balance || b.totalWagered - a.totalWagered)
      .slice(0, 10)
      .map((u) => ({
        id: u.id,
        username: u.username,
        balance: ROUND2(u.balance),
        totalWagered: ROUND2(u.totalWagered),
        betsCount: u.betsCount,
        winsCount: u.winsCount,
      }));
    return Response.json({ users });
  } catch (e) {
    console.error("GET /api/leaderboard", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
