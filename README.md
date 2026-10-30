# 🎰 HacheBest — Casino de apuestas (DEMO)

Casino de apuestas online en **modo demo**: cada jugador empieza con **1.000 USD ficticios**, el saldo no tiene valor real y se puede recargar gratis. Todos los resultados se calculan en el **servidor** con RNG criptográfico (`crypto.randomInt`), el cliente nunca decide si ganas o pierdes.

> ⚠️ Proyecto de demostración. Sin dinero real, sin registro por email, +18 por juego responsable.

---

## 🎮 Juegos incluidos (15)

| Juego | Tipo | Detalle |
|---|---|---|
| Par o Impar | Instantáneo | Número 0-99, apuesta a par/impar (1,95x) |
| Número Exacto | Instantáneo | Elige 0-36, acertar paga 36x |
| Cara o Cruz | Instantáneo | 50/50, paga 1,95x |
| Dado | Instantáneo | Rueda 0,00-99,99, mayor/menor con objetivo ajustable |
| Piedra, Papel o Tijera | Instantáneo | Contra la casa, empate devuelve |
| Ruleta | Instantáneo | Europea 0-36: plenos, colores, pares, docenas |
| Tragamonedas | Instantáneo | 3 rodillos, el 7 paga 50x |
| Rueda de la Fortuna | Instantáneo | 26 segmentos, hasta 5x |
| Plinko | Instantáneo | 12 filas, riesgo bajo/medio/alto |
| Carta Más Alta | Instantáneo | Tu carta contra la casa |
| Mayor o Menor | Multi-fase | Cadena de cartas, retírate cuando quieras |
| Blackjack | Multi-fase | Pedir, plantarse y doblar. BJ paga 2,5x |
| Mines | Multi-fase | 1-24 minas, retírate antes de explotar |
| Crash | Multi-fase | Multiplicador en tiempo real, retírate antes del crash |
| 3 en Raya | Partida vs IA | Ganas 2,5x, empate devuelve |

---

## 🔌 API — cada cosa tiene su endpoint

### Juegos (uno por juego)

| Endpoint | Descripción |
|---|---|
| `POST /api/games/parimpar` | `{ userId, betType: "par"\|"impar", amount }` |
| `POST /api/games/exacto` | `{ userId, amount, extra: { number } }` |
| `POST /api/games/moneda` | `{ userId, betType: "cara"\|"cruz", amount }` |
| `POST /api/games/dado` | `{ userId, betType: "mayor"\|"menor", amount, extra: { target } }` |
| `POST /api/games/ppt` | `{ userId, betType: "piedra"\|"papel"\|"tijera", amount }` |
| `POST /api/games/ruleta` | `{ userId, betType: "pleno"\|"rojo"\|"negro"\|"par"\|"impar"\|"bajo"\|"alto"\|"docena1..3", amount, extra?: { number } }` |
| `POST /api/games/tragamonedas` | `{ userId, betType: "girar", amount }` |
| `POST /api/games/rueda` | `{ userId, betType: "girar", amount }` |
| `POST /api/games/plinko` | `{ userId, betType: "drop", amount, extra: { risk } }` |
| `POST /api/games/cartaalta` | `{ userId, betType: "jugar", amount }` |
| `POST /api/games/mayormenor` | `{ userId, action: "start"\|"act", ... }` |
| `POST /api/games/blackjack` | `{ userId, action: "start"\|"act", ... }` (act: hit/stand/double) |
| `POST /api/games/mines` | `{ userId, action: "start"\|"act", ... }` (act: reveal/cashout) |
| `POST /api/games/crash` | `{ userId, action: "start"\|"act", ... }` (act: tick/cashout) |
| `POST /api/games/tictactoe` | `{ userId, action: "start"\|"settle", ... }` |

### Usuarios y varios

| Endpoint | Descripción |
|---|---|
| `POST /api/user` | Login/registro demo `{ username }` → crea usuario con 1.000 USD |
| `GET /api/user?id=` | Datos del usuario |
| `POST /api/user/reset` | Recargar saldo demo a 1.000 USD |
| `GET /api/games` | Catálogo y configuración pública de los juegos |
| `GET /api/bets?userId=` | Historial de apuestas |
| `GET /api/leaderboard` | Top 10 por saldo |
| `GET /api` | Índice completo de la API |

### Panel de administración

**Web:** `GET /admin` (página con login por contraseña)

| Endpoint | Descripción |
|---|---|
| `POST /api/admin` | Login admin `{ password }` |
| `GET /api/admin` | Validar sesión admin (cabecera `x-admin-key`) |
| `GET /api/admin/stats` | Estadísticas + mayores premios |
| `GET /api/admin/bets?limit=` | Feed de últimas apuestas en tiempo real |
| `GET/PUT /api/admin/games` | Config de juegos: activar/desactivar, límites, multiplicadores |
| `GET/PATCH /api/admin/users` | Banear, reactivar, fijar saldo, resetear |
| `GET/PUT /api/admin/settings` | Cambiar contraseña del panel |

> Las rutas admin requieren la cabecera `x-admin-key` con la contraseña.

---

## 🔐 Panel admin

- **URL:** `/admin` (enlace "Admin" en el pie de página del casino)
- **Contraseña por defecto:** `admin123`
- Se puede cambiar desde el propio panel (pestaña *Ajustes*) o con la variable de entorno `ADMIN_PASSWORD`
- Funciones: estadísticas del casino, feed de apuestas en vivo, gestión de usuarios (banear, saldo, reset), configuración por juego (on/off, apuesta mín/máx, multiplicadores), cambio de contraseña

---

## 🚀 Desplegar en Vercel (sin configurar nada)

1. Sube este repositorio a GitHub (ya está).
2. Entra en [vercel.com/new](https://vercel.com/new) e **importa el repositorio**.
3. **No toques nada**: no necesita base de datos, ni variables de entorno obligatorias, ni comandos especiales. Deploy.
4. (Opcional) En *Settings → Environment Variables* añade `ADMIN_PASSWORD` para la contraseña del panel.

**¿Dónde se guardan los datos?** No usa base de datos externa: los usuarios, apuestas y ajustes viven en un archivo JSON. En tu ordenador es `db/data.json`; en Vercel es `/tmp/hachebest/data.json` (espacio temporal del servidor). En modo demo es suficiente: si la instancia se reinicia, los saldos se regeneran al volver a entrar con tu nombre de usuario.

---

## 💻 Desarrollo local

```bash
bun install
bun run dev      # http://localhost:3000
bun run lint     # ESLint
```

Stack: **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Zustand · Sonner**.

## 🧱 Arquitectura

```
src/
├── app/
│   ├── page.tsx              # Casino (lobby, juegos, historial, ranking)
│   ├── admin/page.tsx        # Panel de administración
│   └── api/
│       ├── games/<juego>/    # ⬅️ Un endpoint por juego (15)
│       ├── user/ · bets/ · leaderboard/
│       └── admin/            # stats · bets · games · users · settings
├── lib/
│   ├── games.ts              # Lógica de juegos instantáneos (RNG crypto)
│   ├── games-session.ts      # Lógica de juegos multi-fase
│   ├── game-handlers.ts      # Handlers compartidos de los endpoints
│   ├── db.ts                 # Store JSON persistente (Vercel-ready)
│   └── admin.ts              # Autenticación del panel
├── components/casino/        # UI del casino y de cada juego
└── store/casino.ts           # Estado global (Zustand)
```

Hecho con ❤️ para HacheJotaDev.
