import { NextRequest } from "next/server";
import { checkAdmin, unauthorized } from "@/lib/admin";
import {
  houseBankSnapshot,
  recapitalizeHouse,
  withdrawHouseFunds,
} from "@/lib/house";

/**
 * POST /api/admin/house/bank
 * Operaciones de la banca de la casa:
 *  · { action: "retirar", amount }       — el dueño retira GANANCIAS
 *  · { action: "recapitalizar", amount } — el dueño recarga la banca
 */
export async function POST(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  try {
    const body = (await req.json()) as { action?: string; amount?: number };
    const amount = Number(body.amount);

    if (body.action === "retirar") {
      const res = withdrawHouseFunds(amount);
      if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
      return Response.json({ ok: true, mensaje: "Ganancias retiradas de la banca", bank: houseBankSnapshot() });
    }

    if (body.action === "recapitalizar") {
      const res = recapitalizeHouse(amount);
      if (!res.ok) return Response.json({ error: res.error }, { status: 400 });
      return Response.json({ ok: true, mensaje: "Banca recargada", bank: houseBankSnapshot() });
    }

    return Response.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    console.error("POST /api/admin/house/bank", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
