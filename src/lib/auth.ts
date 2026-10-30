import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getUser, type UserRecord } from "@/lib/db";
import { ROUND2 } from "@/lib/games";
import {
  createSessionToken,
  readSessionCookie,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  verifySessionToken,
} from "@/lib/token";

// ─────────────────────────────────────────────────────────────
// HacheBest — Autenticación de jugadores (server-side)
//
//  · Contraseñas con scrypt + sal aleatoria (nunca en claro).
//  · Sesión = cookie httpOnly firmada con HMAC (ver src/lib/token.ts).
//  · requireUser() protege CUALQUIER endpoint: devuelve el usuario
//    de la sesión o un error 401/403 listo para responder.
//  · Límite de intentos de login por IP+usuario (anti fuerza bruta).
// ─────────────────────────────────────────────────────────────

export const USERNAME_RE = /^[a-zA-Z0-9_áéíóúüñÁÉÍÓÚÑ]{2,16}$/;

// ── Contraseñas ──────────────────────────────────────────────

/** Hash scrypt: "s2$<sal>$<hash>" — nunca se guarda la contraseña */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `s2$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [tag, salt, hash] = stored.split("$");
  if (tag !== "s2" || !salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const orig = Buffer.from(hash, "hex");
  return orig.length === test.length && timingSafeEqual(orig, test);
}

// ── Sesión (cookie httpOnly firmada) ─────────────────────────

/** Crea la sesión del usuario y deja la cookie en la respuesta */
export async function startSession(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Cierra la sesión (borra la cookie) */
export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

// ── Protección de endpoints ──────────────────────────────────

export type AuthCheck =
  | { ok: true; user: UserRecord }
  | { ok: false; error: Response };

/**
 * Exige sesión válida. Úsalo al principio de cada endpoint:
 *   const auth = await requireUser(req);
 *   if (!auth.ok) return auth.error;
 */
export async function requireUser(req: Request): Promise<AuthCheck> {
  const token = readSessionCookie(req.headers.get("cookie"));
  const userId = await verifySessionToken(token);
  if (!userId) {
    return {
      ok: false,
      error: Response.json({ error: "No has iniciado sesión" }, { status: 401 }),
    };
  }
  const user = getUser(userId);
  if (!user) {
    return {
      ok: false,
      error: Response.json({ error: "Sesión no válida. Inicia sesión de nuevo." }, { status: 401 }),
    };
  }
  if (user.isBanned) {
    return {
      ok: false,
      error: Response.json({ error: "Esta cuenta está suspendida" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}

// ── Usuario público (NUNCA incluye el hash de la contraseña) ──

export function publicUser(u: UserRecord) {
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

// ── Anti fuerza bruta en el login ────────────────────────────

const MAX_LOGIN_TRIES = 10;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;

const loginTries = new Map<string, { n: number; reset: number }>();

/** Clave de límite: IP + usuario */
export function loginKey(req: Request, username: string): string {
  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  return `${ip}:${username.toLowerCase()}`;
}

export function loginBlocked(key: string): boolean {
  const t = loginTries.get(key);
  if (!t) return false;
  if (Date.now() > t.reset) {
    loginTries.delete(key);
    return false;
  }
  return t.n >= MAX_LOGIN_TRIES;
}

export function registerLoginFail(key: string): void {
  const t = loginTries.get(key);
  if (!t || Date.now() > t.reset) {
    loginTries.set(key, { n: 1, reset: Date.now() + LOGIN_WINDOW_MS });
  } else {
    t.n += 1;
  }
}
