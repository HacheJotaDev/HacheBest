import { NextRequest } from "next/server";
import { ensureHydrated, refreshFromRemote, settle, updateUser } from "@/lib/db";
import { publicUser, requireUser } from "@/lib/auth";
import { ROUND2, STARTING_BALANCE } from "@/lib/games";

/** POST /api/user/reset — recarga el saldo demo del usuario CON SESIÓN (si es menor al inicial) */
export async function POST(req: NextRequest) {
  await refreshFromRemote();
  try {
    return await resetInner(req);
  } finally {
    await settle();
  }
}

async function resetInner(req: NextRequest): Promise<Response> {
  try {
    await ensureHydrated();
    const auth = await requireUser(req);
    if (!auth.ok) return auth.error;
    const user = auth.user;

    if (user.balance >= STARTING_BALANCE) {
      return Response.json(
        { error: "Solo puedes recargar cuando tu saldo sea inferior a 1.000,00 USD" },
        { status: 400 },
      );
    }

    const updated = updateUser(user.id, (u) => {
      u.balance = STARTING_BALANCE;
    });
    if (!updated) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    return Response.json({ user: { ...publicUser(updated), balance: ROUND2(updated.balance) } });
  } catch (e) {
    console.error("POST /api/user/reset", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
