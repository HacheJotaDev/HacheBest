import { NextResponse } from "next/server";

/**
 * GET /api — índice de la API de HacheBest
 * Cada juego tiene su propio endpoint y el panel admin el suyo (/admin).
 */
const GAMES = [
  "parimpar", "exacto", "moneda", "dado", "ppt", "ruleta", "tragamonedas",
  "rueda", "plinko", "bacara", "rasca", "cartaalta", // instantáneos
  "mayormenor", "blackjack",                        // multi-fase
  "tictactoe",                                      // partida
];

export function GET() {
  return NextResponse.json({
    name: "HacheBest API",
    version: "2.0",
    mode: "demo",
    endpoints: {
      usuarios: {
        "POST /api/auth/login": "entrar o crear cuenta (usuario + contraseña)",
        "GET /api/auth/me": "usuario con sesión activa",
        "POST /api/auth/logout": "cerrar sesión",
        "GET /api/user": "datos del usuario con sesión",
        "POST /api/user/reset": "recargar saldo demo",
      },
      juegos: Object.fromEntries(
        GAMES.map((g) => [`POST /api/games/${g}`, `jugar a ${g}`]),
      ),
      varios: {
        "GET /api/games": "catálogo y configuración pública de los juegos",
        "GET /api/bets": "historial de apuestas del usuario con sesión",
        "GET /api/leaderboard": "top 10 por saldo",
      },
      admin: {
        "POST /api/admin": "login del panel (contraseña)",
        "GET /api/admin": "validar sesión admin",
        "GET /api/admin/stats": "estadísticas del casino",
        "GET /api/admin/bets?limit=": "últimas apuestas globales",
        "GET|PUT /api/admin/games": "configuración de juegos",
        "GET|PATCH /api/admin/users": "gestión de usuarios",
        "GET|PUT /api/admin/settings": "contraseña del panel",
        "GET /admin": "panel de administración (web)",
      },
    },
  });
}
