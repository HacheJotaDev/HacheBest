import { NextRequest } from "next/server";
import { ensureHydrated } from "@/lib/db";
import { publicUser, requireUser } from "@/lib/auth";

/** GET /api/auth/me — usuario de la sesión actual (401 si no hay sesión) */
export async function GET(req: NextRequest) {
  try {
    await ensureHydrated();
    const auth = await requireUser(req);
    if (!auth.ok) return auth.error;
    return Response.json({ user: publicUser(auth.user) });
  } catch (e) {
    console.error("GET /api/auth/me", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
