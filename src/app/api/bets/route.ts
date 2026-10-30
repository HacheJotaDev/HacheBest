import { NextRequest } from "next/server";
import { ensureHydrated, listUserBets } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** GET /api/bets?limit=25 — historial de apuestas del usuario CON SESIÓN */
export async function GET(req: NextRequest) {
  try {
    await ensureHydrated();
    const auth = await requireUser(req);
    if (!auth.ok) return auth.error;

    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 25) || 25, 100);
    const bets = listUserBets(auth.user.id, limit);
    return Response.json({ bets });
  } catch (e) {
    console.error("GET /api/bets", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
