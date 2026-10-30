// ─────────────────────────────────────────────────────────────
// HacheBest — Tokens de sesión firmados (HMAC-SHA256)
//
// Solo Web Crypto: funciona en el runtime Edge del proxy Y en
// las rutas API de Node. El token es `<payload>.<firma>` en
// base64url; el payload guarda el usuario y la expiración.
// La cookie es httpOnly → JavaScript del navegador no puede
// leerla (protección básica contra XSS).
//
// Secreto: variable de entorno AUTH_SECRET (defínela en Vercel).
// Si no existe, se usa uno por defecto para que la demo funcione.
// ─────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "hb_token";

/** Duración de la sesión: 30 días */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function sessionSecret(): string {
  return `${process.env.AUTH_SECRET?.trim() || "hachebest-secreto-demo"}|v1`;
}

function bytesToB64url(bytes: Uint8Array): string {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const raw = atob(b64 + pad);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Crea un token de sesión firmado para un usuario */
export async function createSessionToken(userId: string, maxAge = SESSION_MAX_AGE): Promise<string> {
  const payload = bytesToB64url(
    new TextEncoder().encode(
      JSON.stringify({ u: userId, e: Math.floor(Date.now() / 1000) + maxAge }),
    ),
  );
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${bytesToB64url(new Uint8Array(sig))}`;
}

/** Devuelve el userId si el token es válido y no ha expirado (si no, null) */
export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  try {
    const key = await hmacKey();
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(token.slice(dot + 1)),
      new TextEncoder().encode(payload),
    );
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))) as {
      u?: string;
      e?: number;
    };
    if (!data.u || typeof data.e !== "number" || data.e * 1000 < Date.now()) return null;
    return data.u;
  } catch {
    return null;
  }
}

/** Lee la cookie de sesión desde una cabecera Cookie */
export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) return part.slice(eq + 1).trim();
  }
  return null;
}
