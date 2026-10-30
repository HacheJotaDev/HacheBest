import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin, getAdminPassword, unauthorized } from "@/lib/admin";

/** PUT /api/admin/settings — cambiar contraseña del panel */
export async function PUT(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
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
    await db.setting.upsert({
      where: { key: "adminPassword" },
      update: { value: newPassword },
      create: { key: "adminPassword", value: newPassword },
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/admin/settings", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
