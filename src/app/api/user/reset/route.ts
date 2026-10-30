import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { STARTING_BALANCE, ROUND2 } from "@/lib/games";

/** POST /api/user/reset — recarga el saldo demo a 1000 USD (solo si el saldo es menor al inicial) */
export async function POST(req: NextRequest) {
  try {
    const { userId } = (await req.json()) as { userId?: string };
    if (!userId) return Response.json({ error: "Falta userId" }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.isBanned) return Response.json({ error: "Cuenta suspendida" }, { status: 403 });
    if (user.balance >= STARTING_BALANCE) {
      return Response.json(
        { error: "Solo puedes recargar cuando tu saldo sea inferior a 1.000,00 USD" },
        { status: 400 },
      );
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { balance: STARTING_BALANCE },
    });
    return Response.json({ user: { ...updated, balance: ROUND2(updated.balance) } });
  } catch (e) {
    console.error("POST /api/user/reset", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
