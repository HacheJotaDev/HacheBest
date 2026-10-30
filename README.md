# 🎲 HacheBest

**Casino de apuestas en modo DEMO** hecho con Next.js 16. Todos los jugadores reciben **1.000,00 USD de saldo ficticio** al registrarse para probar los juegos sin riesgo.

> ⚠️ Este proyecto es un entretenimiento/demostración: el saldo no tiene valor real y no se aceptan pagos de ningún tipo.

## 🎮 Juegos incluidos (15)

| Juego | Cómo se juega | Premio |
|---|---|---|
| **Crash** | El multiplicador despega y crece; retírate antes del crash (retiro automático opcional) | hasta ×5000 |
| **Mines** | Revela gemas en una cuadrícula 5×5 esquivando 1-24 minas; retírate cuando quieras | hasta ×24,75 |
| **Blackjack** | Llega a 21 contra el crupier: pedir, plantarse o doblar | ×2,5 (natural) |
| **Ruleta** | Ruleta europea 0-36: plenos, colores, paridad, mitades y docenas | ×36 (pleno) |
| **Plinko** | Deja caer la bola en el tablero de pinchos (riesgo bajo/medio/alto) | hasta ×170 |
| **Tragamonedas** | 3 rodillos con cereza, limón, campana, estrella, diamante y 7 | hasta ×50 |
| **Mayor o Menor** | Cadena de cartas: ¿la siguiente es mayor o igual / menor o igual? Retiro en cualquier momento | hasta ×12,87 |
| **Rueda de la Fortuna** | 26 segmentos: quiebra, ×1,5, ×2, ×3… y un ×5 escondido | ×5 |
| **Carta Más Alta** | Tu carta contra la de la casa; el empate devuelve | ×2,05 |
| **Par o Impar** | Apuesta a si el número 0-99 será par o impar | ×1,95 |
| **Número Exacto** | Elige un número de la ruleta (0-36) | ×36 |
| **Cara o Cruz** | Lanza la moneda y elige el lado | ×1,95 |
| **Dado** | Mayor/menor con objetivo ajustable (2-98), multiplicador dinámico | hasta ×49,5 |
| **3 en Raya** | Duelo contra la IA: ganar paga, **empatar devuelve** la apuesta | ×2,5 |
| **Piedra, Papel o Tijera** | Contra la casa, el empate devuelve tu apuesta | ×2,9 |

## ✨ Características

- 🔐 **Lógica de juego 100% en el servidor**: RNG criptográfico (`crypto.randomInt`), validación de límites, saldo y reglas por partida.
- 🛡️ **Anti-fraude en 3 en Raya**: el servidor verifica que el tablero final sea una partida válida y terminal; los tableros imposibles se anulan con reembolso.
- 🃏 **Juegos de sesión con estado seguro**: blackjack, mines, mayor o menor y crash guardan su estado en el servidor (las minas y el punto de crash jamás se envían al cliente); las rondas abandonadas se reembolsan automáticamente.
- 👛 **Saldo demo**: 1.000 USD por jugador, recargable cuando bajas de 1.000.
- 📊 **Historial y estadísticas**: últimas 30 apuestas con balance de ganancias.
- 🏆 **Ranking**: top 10 jugadores por saldo.
- 🛠️ **Panel de administración** (botón "Admin" en el pie de página):
  - Resumen: usuarios, apuestas, total apostado, beneficio de la casa y mayores premios.
  - Usuarios: fijar saldo, resetear a 1.000 USD, suspender/reactivar cuentas.
  - Juegos: activar/desactivar (mantenimiento), límites mín/máx y multiplicadores en caliente (los 15 juegos).
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
src/lib/games.ts              # Lógica de juegos instantáneos (RNG, payouts, validaciones)
src/lib/games-session.ts      # Juegos de sesión: blackjack, mines, mayor o menor, crash
src/app/api/                  # user, game/play, game/session, game/tictactoe, bets, leaderboard, games, admin/*
src/components/casino/        # Header, lobby, 15 juegos, historial, ranking, panel admin
src/store/casino.ts           # Estado global (zustand)
```

## 🔒 API de administración

Todas las rutas `/api/admin/*` comprueban la cabecera `x-admin-key` contra la contraseña guardada en la base de datos (por defecto `admin123`).

---

Hecho con ❤️ por **HacheJotaDev** — juega con cabeza, es solo una demo 😉
