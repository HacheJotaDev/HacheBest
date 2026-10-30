import { NextRequest } from "next/server";
import { checkAdmin, unauthorized } from "@/lib/admin";
import { getUser, listUsers, refreshFromRemote, settle, updateUser } from "@/lib/db";
import { ROUND2, STARTING_BALANCE } from "@/lib/games";

/** Vista segura de un usuario para el panel: NUNCA incluye el hash */
function adminUser(u: NonNullable<ReturnType<typeof getUser>>) {
  return {
    id: u.id,
    username: u.username,
    hasPassword: u.passHash !== null,
    balance: ROUND2(u.balance),
    totalWagered: ROUND2(u.totalWagered),
    totalPayout: ROUND2(u.totalPayout),
    betsCount: u.betsCount,
    winsCount: u.winsCount,
    lossesCount: u.lossesCount,
    isBanned: u.isBanned,
    createdAt: u.createdAt,
  };
}

/** GET /api/admin/users — lista completa de usuarios (sin hashes de contraseña) */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const users = listUsers(200).map(adminUser);
    return Response.json({ users });
  } catch (e) {
    console.error("GET /api/admin/users", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** PATCH /api/admin/users — acciones sobre un usuario */
export async function PATCH(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  await refreshFromRemote();
  try {
    return await patchInner(req);
  } finally {
    await settle();
  }
}

async function patchInner(req: NextRequest): Promise<Response> {
  try {
    const { userId, action, value } = (await req.json()) as {
      userId?: string;
      action?: "ban" | "unban" | "setBalance" | "reset" | "resetPassword";
      value?: number;
    };
    if (!userId || !action) return Response.json({ error: "Faltan parámetros" }, { status: 400 });
    const user = getUser(userId);
    if (!user) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });

    const updated = updateUser(userId, (u) => {
      if (action === "ban") u.isBanned = true;
      else if (action === "unban") u.isBanned = false;
      else if (action === "reset") u.balance = STARTING_BALANCE;
      else if (action === "resetPassword") u.passHash = null;
      else if (action === "setBalance") {
        const v = ROUND2(Number(value));
        if (Number.isFinite(v) && v >= 0) u.balance = v;
      }
    });
    if (!updated) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });

    return Response.json({ user: adminUser(updated) });
  } catch (e) {
    console.error("PATCH /api/admin/users", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
