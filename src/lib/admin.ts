import { getSetting } from "@/lib/db";

export const DEFAULT_ADMIN_USER = "HacheJota";
export const DEFAULT_ADMIN_PASSWORD = "HacheAdmin";

/**
 * Usuario del panel /admin:
 * 1. Variable de entorno ADMIN_USER (recomendado en Vercel)
 * 2. Usuario guardado en ajustes
 * 3. "HacheJota" por defecto
 */
export async function getAdminUser(): Promise<string> {
  const envUser = process.env.ADMIN_USER?.trim();
  if (envUser) return envUser;
  return (await Promise.resolve(getSetting("adminUser"))) ?? DEFAULT_ADMIN_USER;
}

/**
 * Contraseña del panel /admin:
 * 1. Variable de entorno ADMIN_PASSWORD (recomendado en Vercel)
 * 2. Contraseña guardada desde el propio panel
 * 3. "HacheAdmin" por defecto
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
