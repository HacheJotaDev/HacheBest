import { NextRequest } from "next/server";
import { listUserBets } from "@/lib/db";

/** GET /api/bets?userId=...&limit=25 — historial de apuestas del usuario */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const userId = sp.get("userId");
    const limit = Math.min(Number(sp.get("limit") ?? 25) || 25, 100);
    if (!userId) return Response.json({ error: "Falta userId" }, { status: 400 });

    const bets = listUserBets(userId, limit);
    return Response.json({ bets });
  } catch (e) {
    console.error("GET /api/bets", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
