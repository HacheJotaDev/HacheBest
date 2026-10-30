import { getSetting } from "@/lib/db";

export const DEFAULT_ADMIN_PASSWORD = "admin123";

/**
 * Contraseña del panel /admin:
 * 1. Variable de entorno ADMIN_PASSWORD (recomendado en Vercel)
 * 2. Contraseña guardada desde el propio panel
 * 3. "admin123" por defecto
 */
export async function getAdminPassword(): Promise<string> {
  const envPassword = process.env.ADMIN_PASSWORD?.trim();
  if (envPassword) return envPassword;
  return (await Promise.resolve(getSetting("adminPassword"))) ?? DEFAULT_ADMIN_PASSWORD;
}

/** Comprueba la cabecera x-admin-key contra la contraseña guardada */
export async function checkAdmin(req: Request): Promise<boolean> {
  const key = req.headers.get("x-admin-key") ?? "";
  const password = await getAdminPassword();
  return key.length > 0 && key === password;
}

export function unauthorized() {
  return Response.json({ error: "Contraseña de administrador incorrecta" }, { status: 401 });
}
