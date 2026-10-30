import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { checkAdmin, unauthorized } from "@/lib/admin";
import { ROUND2, STARTING_BALANCE } from "@/lib/games";

/** GET /api/admin/users — lista completa de usuarios */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return Response.json({
      users: users.map((u) => ({
        ...u,
        balance: ROUND2(u.balance),
        totalWagered: ROUND2(u.totalWagered),
        totalPayout: ROUND2(u.totalPayout),
      })),
    });
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
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });

    let data: Record<string, number | boolean> = {};
    if (action === "ban") data = { isBanned: true };
    else if (action === "unban") data = { isBanned: false };
    else if (action === "reset") data = { balance: STARTING_BALANCE };
    else if (action === "setBalance") {
      const v = ROUND2(Number(value));
      if (!Number.isFinite(v) || v < 0) {
        return Response.json({ error: "Saldo inválido" }, { status: 400 });
      }
      data = { balance: v };
    }

    const updated = await db.user.update({ where: { id: userId }, data });
    return Response.json({
      user: { ...updated, balance: ROUND2(updated.balance), totalWagered: ROUND2(updated.totalWagered), totalPayout: ROUND2(updated.totalPayout) },
    });
  } catch (e) {
    console.error("PATCH /api/admin/users", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
