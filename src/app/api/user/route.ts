import { NextRequest } from "next/server";
import { ensureHydrated } from "@/lib/db";
import { publicUser, requireUser } from "@/lib/auth";

/** GET /api/user — datos del usuario CON SESIÓN (ya no se acepta ?id= de terceros) */
export async function GET(req: NextRequest) {
  try {
    await ensureHydrated();
    const auth = await requireUser(req);
    if (!auth.ok) return auth.error;
    return Response.json({ user: publicUser(auth.user) });
  } catch (e) {
    console.error("GET /api/user", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
