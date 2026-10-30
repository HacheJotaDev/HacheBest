import { NextRequest } from "next/server";
import { checkAdmin, getAdminPassword } from "@/lib/admin";

/** POST /api/admin — login del panel de administración */
export async function POST(req: NextRequest) {
  try {
    const { password } = (await req.json()) as { password?: string };
    const real = await getAdminPassword();
    if (!password || password !== real) {
      return Response.json({ error: "Contraseña incorrecta" }, { status: 401 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** GET /api/admin — valida la cabecera x-admin-key */
export async function GET(req: NextRequest) {
  const ok = await checkAdmin(req);
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}
