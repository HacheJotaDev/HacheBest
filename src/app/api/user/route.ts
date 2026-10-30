import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { STARTING_BALANCE, ROUND2 } from "@/lib/games";

const USERNAME_RE = /^[a-zA-Z0-9_áéíóúüñÁÉÍÓÚÑ]{2,16}$/;

function publicUser(u: {
  id: string;
  username: string;
  balance: number;
  totalWagered: number;
  totalPayout: number;
  betsCount: number;
  winsCount: number;
  lossesCount: number;
  isBanned: boolean;
  createdAt: Date;
}) {
  return {
    id: u.id,
    username: u.username,
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

/** POST /api/user — login/registro demo con nombre de usuario */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string };
    const raw = (body.username ?? "").trim();
    if (!USERNAME_RE.test(raw)) {
      return Response.json(
        { error: "Nombre inválido: 2-16 caracteres (letras, números y _)" },
        { status: 400 },
      );
    }
    const username = raw.toLowerCase();

    const existing = await db.user.findUnique({ where: { username } });
    if (existing) {
      if (existing.isBanned) {
        return Response.json({ error: "Esta cuenta está suspendida. Contacta al administrador." }, { status: 403 });
      }
      return Response.json({ user: publicUser(existing), isNew: false });
    }

    const created = await db.user.create({ data: { username, balance: STARTING_BALANCE } });
    return Response.json({ user: publicUser(created), isNew: true });
  } catch (e) {
    console.error("POST /api/user", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}

/** GET /api/user?id=... — datos del usuario */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return Response.json({ error: "Falta id" }, { status: 400 });
    const user = await db.user.findUnique({ where: { id } });
    if (!user) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    return Response.json({ user: publicUser(user) });
  } catch (e) {
    console.error("GET /api/user", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
