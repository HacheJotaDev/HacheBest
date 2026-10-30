import { NextRequest } from "next/server";
import { checkAdmin, getAdminPassword, getAdminUser } from "@/lib/admin";
import { ensureHydrated } from "@/lib/db";

/** POST /api/admin — login del panel de administración */
export async function POST(req: NextRequest) {
  try {
    await ensureHydrated();
    const { user, password } = (await req.json()) as { user?: string; password?: string };
    const [realUser, realPassword] = await Promise.all([getAdminUser(), getAdminPassword()]);
    const userOk = typeof user === "string" && user.trim().toLowerCase() === realUser.toLowerCase();
    if (!userOk || !password || password !== realPassword) {
      return Response.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** GET /api/admin — valida la cabecera x-admin-key */
export async function GET(req: NextRequest) {
  await ensureHydrated();
  const ok = await checkAdmin(req);
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}
