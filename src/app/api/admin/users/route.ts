import { NextRequest } from "next/server";
import { checkAdmin, unauthorized } from "@/lib/admin";
import { getUser, listUsers, updateUser } from "@/lib/db";
import { ROUND2, STARTING_BALANCE } from "@/lib/games";

/** GET /api/admin/users — lista completa de usuarios */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const users = listUsers(200).map((u) => ({
      ...u,
      balance: ROUND2(u.balance),
      totalWagered: ROUND2(u.totalWagered),
      totalPayout: ROUND2(u.totalPayout),
    }));
    return Response.json({ users });
  } catch (e) {
    console.error("GET /api/admin/users", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** PATCH /api/admin/users — acciones sobre un usuario */
export async function PATCH(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const { userId, action, value } = (await req.json()) as {
      userId?: string;
      action?: "ban" | "unban" | "setBalance" | "reset";
      value?: number;
    };
    if (!userId || !action) return Response.json({ error: "Faltan parámetros" }, { status: 400 });
    const user = getUser(userId);
    if (!user) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });

    const updated = updateUser(userId, (u) => {
      if (action === "ban") u.isBanned = true;
      else if (action === "unban") u.isBanned = false;
      else if (action === "reset") u.balance = STARTING_BALANCE;
      else if (action === "setBalance") {
        const v = ROUND2(Number(value));
        if (Number.isFinite(v) && v >= 0) u.balance = v;
      }
    });

    return Response.json({
      user: {
        ...updated,
        balance: ROUND2(updated?.balance ?? 0),
        totalWagered: ROUND2(updated?.totalWagered ?? 0),
        totalPayout: ROUND2(updated?.totalPayout ?? 0),
      },
    });
  } catch (e) {
    console.error("PATCH /api/admin/users", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
