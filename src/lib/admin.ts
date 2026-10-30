import { db } from "@/lib/db";

export const DEFAULT_ADMIN_PASSWORD = "admin123";

export async function getAdminPassword(): Promise<string> {
  const s = await db.setting.findUnique({ where: { key: "adminPassword" } });
  return s?.value ?? DEFAULT_ADMIN_PASSWORD;
}

/** Comprueba la cabecera x-admin-key contra la contraseña guardada */
export async function checkAdmin(req: Request): Promise<boolean> {
  const key = req.headers.get("x-admin-key") ?? "";
  const password = await getAdminPassword();
  return key === password && key.length > 0;
}

export function unauthorized() {
  return Response.json({ error: "Contraseña de administrador incorrecta" }, { status: 401 });
}
