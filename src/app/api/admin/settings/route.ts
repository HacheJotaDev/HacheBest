import { NextRequest } from "next/server";
import { checkAdmin, getAdminPassword, unauthorized } from "@/lib/admin";
import { getSetting, refreshFromRemote, setSetting, settle } from "@/lib/db";

/** PUT /api/admin/settings — cambiar contraseña del panel */
export async function PUT(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  await refreshFromRemote();
  try {
    return await putInner(req);
  } finally {
    await settle();
  }
}

async function putInner(req: NextRequest): Promise<Response> {
  try {
    const { currentPassword, newPassword } = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    const real = await getAdminPassword();
    if (currentPassword !== real) {
      return Response.json({ error: "La contraseña actual no coincide" }, { status: 400 });
    }
    if (!newPassword || newPassword.length < 5) {
      return Response.json({ error: "La nueva contraseña debe tener al menos 5 caracteres" }, { status: 400 });
    }
    setSetting("adminPassword", newPassword);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/admin/settings", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** GET /api/admin/settings — estado actual (sin secretos) */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  const hasCustom = Boolean(getSetting("adminPassword"));
  return Response.json({
    passwordSource: process.env.ADMIN_PASSWORD ? "env" : hasCustom ? "panel" : "default",
  });
}
