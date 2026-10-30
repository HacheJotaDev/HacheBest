import { NextRequest, NextResponse } from "next/server";
import { readSessionCookie, verifySessionToken } from "@/lib/token";

// ─────────────────────────────────────────────────────────────
// HacheBest — Proxy de protección (antes "middleware")
//
// PRIMERO EL LOGIN: todo lo que no sea público exige sesión.
//  · /admin y /api/admin/* → se protegen solos con su contraseña
//    (x-admin-key); NO requieren sesión de jugador.
//  · /login → libre (y si ya tienes sesión, te manda al casino).
//  · /api/auth/login y /api/auth/logout → libres (el login ES la puerta).
//  · /api (índice informativo) → libre.
//  · TODO lo demás (páginas y API) exige cookie de sesión válida:
//    · páginas → redirige a /login?next=…
//    · API → 401 JSON
// ─────────────────────────────────────────────────────────────

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = readSessionCookie(req.headers.get("cookie"));

  // El panel oculto se gobierna con su propia contraseña
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  // La puerta de entrada: libre para todos. (No se redirige a quienes
  // ya tienen cookie: si la cuenta está suspendida, el proxy no puede
  // saberlo y mandarlo al casino crearía un bucle de redirecciones.)
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Endpoints del propio login/logout (sin ellos no se entra)
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout" || pathname === "/api") {
    return NextResponse.next();
  }

  // Todo lo demás: sesión obligatoria
  if (await verifySessionToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "No has iniciado sesión" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
