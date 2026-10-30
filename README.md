# 🎲 HacheBest

**Casino de apuestas en modo DEMO** hecho con Next.js 16. Todos los jugadores reciben **1.000,00 USD de saldo ficticio** al registrarse para probar los juegos sin riesgo.

> ⚠️ Este proyecto es un entretenimiento/demostración: el saldo no tiene valor real y no se aceptan pagos de ningún tipo.

## 🎮 Juegos incluidos

| Juego | Cómo se juega | Premio |
|---|---|---|
| **Par o Impar** | Apuesta a si el número 0-99 será par o impar | ×1,95 |
| **Número Exacto** | Elige un número de la ruleta (0-36) | ×36 |
| **Cara o Cruz** | Lanza la moneda y elige el lado | ×1,95 |
| **Dado** | Mayor/menor con objetivo ajustable (2-98), multiplicador dinámico | hasta ×49,5 |
| **3 en Raya** | Duelo contra la IA: ganar paga, **empatar devuelve** la apuesta | ×2,5 |
| **Piedra, Papel o Tijera** | Contra la casa, el empate devuelve tu apuesta | ×2,9 |

## ✨ Características

- 🔐 **Lógica de juego 100% en el servidor**: RNG criptográfico (`crypto.randomInt`), validación de límites, saldo y reglas por partida.
- 🛡️ **Anti-fraude en 3 en Raya**: el servidor verifica que el tablero final sea una partida válida y terminal; los tableros imposibles se anulan con reembolso.
- 👛 **Saldo demo**: 1.000 USD por jugador, recargable cuando bajas de 1.000.
- 📊 **Historial y estadísticas**: últimas 30 apuestas con balance de ganancias.
- 🏆 **Ranking**: top 10 jugadores por saldo.
- 🛠️ **Panel de administración** (botón "Admin" en el pie de página):
  - Resumen: usuarios, apuestas, total apostado, beneficio de la casa y mayores premios.
  - Usuarios: fijar saldo, resetear a 1.000 USD, suspender/reactivar cuentas.
  - Juegos: activar/desactivar (mantenimiento), límites mín/máx y multiplicadores en caliente.
  - Ajustes: cambiar la contraseña del panel.
  - Contraseña por defecto: **`admin123`** (cámbiala en Ajustes).

## 🧰 Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui** (tema oscuro casino)
- **Prisma ORM** + **SQLite**
- **Zustand** (estado) + **Framer Motion** (animaciones) + **sonner** (notificaciones)

## 🚀 Puesta en marcha

```bash
# 1. Instalar dependencias
bun install

# 2. Configurar la base de datos
cp .env.example .env
bun run db:push

# 3. Arrancar en desarrollo
bun run dev
```

Abre `http://localhost:3000`, elige tu apodo y se te acreditarán 1.000 USD de demo.

## 📁 Estructura

```
prisma/schema.prisma          # User, Bet, GameConfig, Setting
src/lib/games.ts              # Lógica de juegos server-side (RNG, payouts, validaciones)
src/app/api/                  # user, game/play, game/tictactoe, bets, leaderboard, games, admin/*
src/components/casino/        # Header, lobby, juegos, historial, ranking, panel admin
src/store/casino.ts           # Estado global (zustand)
```

## 🔒 API de administración

Todas las rutas `/api/admin/*` comprueban la cabecera `x-admin-key` contra la contraseña guardada en la base de datos (por defecto `admin123`).

---

Hecho con ❤️ por **HacheJotaDev** — juega con cabeza, es solo una demo 😉
