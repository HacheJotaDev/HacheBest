import { NextRequest } from "next/server";
import {
  createUser,
  ensureHydrated,
  getUser,
  getUserByUsername,
  refreshFromRemote,
  settle,
  updateUser,
} from "@/lib/db";
import {
  hashPassword,
  loginBlocked,
  loginKey,
  publicUser,
  registerLoginFail,
  startSession,
  USERNAME_RE,
  verifyPassword,
} from "@/lib/auth";
import { STARTING_BALANCE } from "@/lib/games";

/**
 * POST /api/auth/login — entrar al casino
 *
 * Usuario + contraseña:
 *  · Si la cuenta NO existe → se crea al instante (saldo demo 1.000 USD).
 *  · Si existe y la contraseña es correcta → entra.
 *  · Si existe de antes sin contraseña (cuentas antiguas de solo apodo)
 *    → esta contraseña queda guardada y el saldo se conserva.
 *  · Si la contraseña es incorrecta → 401.
 */
export async function POST(req: NextRequest) {
  // Sincroniza con la base ANTES de leer el usuario y garantiza que el
  // registro/login queda CONFIRMADO en la base antes de responder:
  // si no, serverless (Vercel) congela la instancia y el usuario
  // "desaparece" justo después de crearlo.
  await refreshFromRemote();
  try {
    return await loginInner(req);
  } finally {
    await settle();
  }
}

async function loginInner(req: NextRequest): Promise<Response> {
  try {
    await ensureHydrated();
    const body = (await req.json()) as { username?: string; password?: string };
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";

    if (!USERNAME_RE.test(username)) {
      return Response.json(
        { error: "Usuario inválido: 2-16 caracteres (letras, números y _)" },
        { status: 400 },
      );
    }
    if (password.length < 4 || password.length > 64) {
      return Response.json(
        { error: "La contraseña debe tener entre 4 y 64 caracteres" },
        { status: 400 },
      );
    }

    const key = loginKey(req, username);
    if (loginBlocked(key)) {
      return Response.json(
        { error: "Demasiados intentos fallidos. Espera 5 minutos y vuelve a probar." },
        { status: 429 },
      );
    }

    const existing = getUserByUsername(username);
    if (existing) {
      if (existing.isBanned) {
        return Response.json(
          { error: "Esta cuenta está suspendida. Contacta al administrador." },
          { status: 403 },
        );
      }
      if (existing.passHash) {
        if (!verifyPassword(password, existing.passHash)) {
          registerLoginFail(key);
          return Response.json({ error: "Contraseña incorrecta" }, { status: 401 });
        }
        await startSession(existing.id);
        return Response.json({
          user: publicUser(getUser(existing.id) ?? existing),
          isNew: false,
          claimed: false,
        });
      }
      // Cuenta antigua sin contraseña: quien entra primero la protege
      const hash = hashPassword(password);
      updateUser(existing.id, (u) => {
        u.passHash = hash;
      });
      await startSession(existing.id);
      return Response.json({
        user: publicUser(getUser(existing.id) ?? existing),
        isNew: false,
        claimed: true,
      });
    }

    // Registro automático: si no hay usuario, se crea uno
    const created = createUser(username, STARTING_BALANCE, hashPassword(password));
    await startSession(created.id);
    return Response.json({ user: publicUser(created), isNew: true, claimed: false });
  } catch (e) {
    console.error("POST /api/auth/login", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
