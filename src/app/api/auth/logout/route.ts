import { endSession } from "@/lib/auth";

/** POST /api/auth/logout — cierra la sesión del jugador */
export async function POST() {
  try {
    await endSession();
    return Response.json({ ok: true });
  } catch (e) {
    console.error("POST /api/auth/logout", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
