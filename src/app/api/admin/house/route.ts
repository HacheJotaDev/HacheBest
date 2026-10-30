import { NextRequest } from "next/server";
import { checkAdmin, unauthorized } from "@/lib/admin";
import { refreshFromRemote, settle } from "@/lib/db";
import {
  effectiveUserWinRate,
  getHouseSettings,
  houseBankSnapshot,
  houseDeficit,
  houseProfit,
  setHouseSettings,
} from "@/lib/house";
import { ROUND2 } from "@/lib/games";

function snapshot() {
  const settings = getHouseSettings();
  return {
    settings,
    houseProfit: ROUND2(houseProfit()),
    deficit: ROUND2(houseDeficit()),
    /** Probabilidad efectiva de victoria del usuario en juegos parejos (%) */
    effectiveWinRate: Math.round(effectiveUserWinRate() * 1000) / 10,
    /** Banca de la casa: fondos, capital, retirable, retiradas… */
    bank: houseBankSnapshot(),
  };
}

/** GET /api/admin/house — estado del "cerebro de la casa" */
export async function GET(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  return Response.json(snapshot());
}

/** PUT /api/admin/house — configurar 50/50 y protección de la banca */
export async function PUT(req: NextRequest) {
  if (!(await checkAdmin(req))) return unauthorized();
  await refreshFromRemote();
  try {
    return await putInner(req);
  } finally {
    await settle();
  }
}

async function putInner(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as {
      userWinPercent?: number;
      protection?: boolean;
    };
    setHouseSettings({
      userWinPercent: body.userWinPercent !== undefined ? Number(body.userWinPercent) : undefined,
      protection: body.protection,
    });
    return Response.json({ ok: true, ...snapshot() });
  } catch (e) {
    console.error("PUT /api/admin/house", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
