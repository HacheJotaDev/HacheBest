import { NextRequest } from "next/server";
import {
  findPendingBet,
  getBet,
  getGameConfig,
  getUser,
  insertBet,
  updateBet,
  updateUser,
} from "@/lib/db";
import {
  GAMES,
  parseConfig,
  playInstant,
  settleTictactoe,
  ROUND2,
  validateBet,
  type Cell,
  type GameId,
} from "@/lib/games";
import {
  actSession,
  blackjackNaturals,
  isSessionGame,
  startSession,
  type Settlement,
  type SessionGameId,
} from "@/lib/games-session";

// ─────────────────────────────────────────────────────────────
// HacheBest — Handlers compartidos de juego (server-side)
//
// Cada juego tiene SU PROPIO endpoint:  POST /api/games/<juego>
// Estos handlers contienen la lógica común (validaciones,
// saldo, registro de apuesta y liquidación) y cada ruta solo
// indica qué juego ejecuta.
// ─────────────────────────────────────────────────────────────

interface PlayBody {
  userId?: string;
  betType?: string;
  amount?: number;
  extra?: Record<string, unknown>;
}

interface SessionBody {
  userId?: string;
  action?: "start" | "act";
  amount?: number;
  betId?: string;
  act?: string;
  extra?: Record<string, unknown>;
}

const bad = (error: string, status = 400) => Response.json({ error }, { status });

type UserCheck = { ok: false; error: Response } | { ok: true; user: UserRow };

type UserRow = NonNullable<ReturnType<typeof getUser>>;

function checkUser(userId: string | undefined): UserCheck {
  if (!userId) return { ok: false, error: bad("Falta el identificador de usuario") };
  const user = getUser(userId);
  if (!user) return { ok: false, error: bad("Usuario no encontrado", 404) };
  if (user.isBanned) return { ok: false, error: bad("Cuenta suspendida", 403) };
  return { ok: true, user };
}

/** Actualiza stats del usuario y paga el resultado (en memoria, atómico) */
function applySettlementToUser(userId: string, amount: number, s: { outcome: string; payout: number }) {
  updateUser(userId, (u) => {
    u.balance = ROUND2(u.balance - amount + s.payout);
    u.totalWagered = ROUND2(u.totalWagered + amount);
    u.betsCount += 1;
    if (s.outcome === "win") {
      u.winsCount += 1;
      u.totalPayout = ROUND2(u.totalPayout + s.payout);
    } else if (s.outcome === "lose") {
      u.lossesCount += 1;
    } else {
      u.totalPayout = ROUND2(u.totalPayout + s.payout);
    }
  });
}

/** Liquida una apuesta pending (juegos de sesión) */
function settlePendingBet(
  userId: string,
  betId: string,
  effAmount: number,
  s: Settlement,
  extraStake?: number,
) {
  if (extraStake && extraStake > 0) {
    updateUser(userId, (u) => {
      u.balance = ROUND2(u.balance - extraStake);
      u.totalWagered = ROUND2(u.totalWagered + extraStake);
    });
  }
  updateBet(betId, (b) => {
    b.amount = effAmount;
    b.outcome = s.outcome;
    b.multiplier = s.multiplier;
    b.payout = s.payout;
    b.profit = ROUND2(s.payout - effAmount);
    b.resultJson = JSON.stringify(s.resultJson);
  });
  updateUser(userId, (u) => {
    if (s.outcome === "win") {
      u.winsCount += 1;
      u.totalPayout = ROUND2(u.totalPayout + s.payout);
    } else if (s.outcome === "lose") {
      u.lossesCount += 1;
    } else {
      u.totalPayout = ROUND2(u.totalPayout + s.payout);
    }
    if (s.payout > 0) u.balance = ROUND2(u.balance + s.payout);
  });
}

// ── JUEGOS INSTANTÁNEOS ──────────────────────────────────────

export async function handleInstantGame(game: GameId, req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as PlayBody;
    const { userId, betType = "", amount } = body;
    const extra = body.extra ?? {};

    if (amount === undefined) return bad("Falta el importe de la apuesta");
    if (!(GAMES as readonly string[]).includes(game)) return bad("Juego desconocido");

    const check = checkUser(userId);
    if (!check.ok) return check.error;
    const user = check.user;

    const config = getGameConfig(game);
    if (!config.enabled) return bad(`${config.name} está desactivado temporalmente`);

    const amt = ROUND2(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) return bad("Importe de apuesta inválido");
    if (amt < config.minBet) return bad(`Apuesta mínima: ${config.minBet.toFixed(2)} USD`);
    if (amt > config.maxBet) return bad(`Apuesta máxima: ${config.maxBet.toFixed(2)} USD`);
    if (user.balance < amt) return bad("Saldo insuficiente");

    const betError = validateBet(game, betType, extra);
    if (betError) return bad(betError);

    const cfg = parseConfig(config.configJson);
    const result = playInstant(game, { amount: amt, betType, extra, cfg });

    applySettlementToUser(user.id, amt, result);
    insertBet({
      userId: user.id,
      game,
      betType,
      amount: amt,
      multiplier: result.multiplier,
      payout: result.payout,
      profit: ROUND2(result.payout - amt),
      outcome: result.outcome,
      resultJson: JSON.stringify(result.resultJson),
    });

    const updated = getUser(user.id)!;
    return Response.json({
      outcome: result.outcome,
      multiplier: result.multiplier,
      payout: result.payout,
      profit: ROUND2(result.payout - amt),
      result: result.resultJson,
      balance: ROUND2(updated.balance),
    });
  } catch (e) {
    console.error(`POST /api/games/${game}`, e);
    return bad("Error interno al procesar la apuesta", 500);
  }
}

// ── JUEGOS DE SESIÓN (multi-fase) ────────────────────────────

export async function handleSessionGame(game: SessionGameId, req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as SessionBody;
    const { userId, action, amount, betId, act } = body;
    const extra = body.extra ?? {};

    if (!isSessionGame(game)) return bad("Juego de sesión desconocido");
    if (!action) return bad("Falta la acción");

    const check = checkUser(userId);
    if (!check.ok) return check.error;
    const user = check.user;

    const config = getGameConfig(game);
    const cfg = parseConfig(config.configJson);
    const name = config.name ?? game;

    // ── INICIO DE PARTIDA ─────────────────────────────────────
    if (action === "start") {
      if (!config.enabled) return bad(`${name} está desactivado temporalmente`);
      const amt = ROUND2(Number(amount));
      if (!Number.isFinite(amt) || amt <= 0) return bad("Importe de apuesta inválido");
      if (amt < config.minBet) return bad(`Apuesta mínima: ${config.minBet.toFixed(2)} USD`);
      if (amt > config.maxBet) return bad(`Apuesta máxima: ${config.maxBet.toFixed(2)} USD`);
      if (user.balance < amt) return bad("Saldo insuficiente");

      // Estado inicial ANTES de tocar datos (puede fallar por parámetros)
      const started = startSession(game, amt, extra, cfg);
      if ("error" in started) return bad(started.error);

      // Cancela rondas pendientes anteriores (reembolso)
      const pending = findPendingBet(user.id, game);
      if (pending) {
        updateBet(pending.id, (b) => {
          b.outcome = "void";
          b.payout = b.amount;
          b.profit = 0;
          b.multiplier = 1;
        });
        updateUser(user.id, (u) => {
          u.balance = ROUND2(u.balance + pending.amount);
        });
      }

      // Descuenta la apuesta y crea la apuesta pending
      updateUser(user.id, (u) => {
        u.balance = ROUND2(u.balance - amt);
        u.totalWagered = ROUND2(u.totalWagered + amt);
        u.betsCount += 1;
      });
      const bet = insertBet({
        userId: user.id,
        game,
        betType: "session",
        amount: amt,
        outcome: "pending",
        resultJson: JSON.stringify(started.state),
      });

      // Blackjack: comprobar naturals inmediatos
      if (game === "blackjack") {
        const nat = blackjackNaturals(
          started.state as Parameters<typeof blackjackNaturals>[0],
          amt,
          cfg,
        );
        if (nat) {
          settlePendingBet(user.id, bet.id, amt, nat);
          const u2 = getUser(user.id)!;
          return Response.json({
            betId: bet.id,
            balance: ROUND2(u2.balance),
            settled: {
              outcome: nat.outcome,
              multiplier: nat.multiplier,
              payout: nat.payout,
              profit: ROUND2(nat.payout - amt),
              result: nat.resultJson as Record<string, unknown>,
            },
          });
        }
      }

      return Response.json({
        betId: bet.id,
        balance: ROUND2(getUser(user.id)!.balance),
        state: started.publicState,
        serverNow: started.serverNow,
      });
    }

    // ── ACCIÓN DENTRO DE LA PARTIDA ───────────────────────────
    if (action === "act") {
      if (!betId || !act) return bad("Faltan parámetros de acción");
      const bet = getBet(betId);
      if (!bet || bet.userId !== user.id) return bad("Apuesta no encontrada", 404);
      if (bet.outcome !== "pending") return bad("Esta ronda ya fue liquidada");

      // Pre-chequeo de saldo para doblar en blackjack
      if (game === "blackjack" && act === "double" && user.balance < bet.amount) {
        return bad("Saldo insuficiente para doblar");
      }

      let state: unknown = {};
      try {
        state = JSON.parse(bet.resultJson || "{}");
      } catch {
        state = {};
      }

      const outcome = actSession(game, { act, extra, state, amount: bet.amount, cfg });
      if (outcome.error) return bad(outcome.error);

      // Ronda continúa: guardar estado y/o apuesta extra (doblar)
      if (!outcome.settlement) {
        const hasState = Boolean(outcome.state);
        const hasStake = Boolean(outcome.extraStake && outcome.extraStake > 0);
        if (hasState || hasStake) {
          updateBet(bet.id, (b) => {
            if (hasStake) b.amount = ROUND2(b.amount + (outcome.extraStake ?? 0));
            if (hasState) b.resultJson = JSON.stringify(outcome.state);
          });
          if (hasStake) {
            updateUser(user.id, (u) => {
              u.balance = ROUND2(u.balance - (outcome.extraStake ?? 0));
              u.totalWagered = ROUND2(u.totalWagered + (outcome.extraStake ?? 0));
            });
          }
        }
        return Response.json({
          settled: false,
          balance: ROUND2(getUser(user.id)!.balance),
          state: outcome.publicState,
          serverNow: outcome.serverNow,
        });
      }

      // Ronda terminada: liquidar (incluye apuesta extra de doblar)
      const effAmount = outcome.extraStake
        ? ROUND2(bet.amount + outcome.extraStake)
        : bet.amount;
      settlePendingBet(user.id, bet.id, effAmount, outcome.settlement, outcome.extraStake);
      return Response.json({
        settled: true,
        balance: ROUND2(getUser(user.id)!.balance),
        outcome: outcome.settlement.outcome,
        multiplier: outcome.settlement.multiplier,
        payout: outcome.settlement.payout,
        profit: ROUND2(outcome.settlement.payout - effAmount),
        result: outcome.settlement.resultJson as Record<string, unknown>,
      });
    }

    return bad("Acción desconocida");
  } catch (e) {
    console.error(`POST /api/games/${game}`, e);
    return bad("Error interno al procesar la partida", 500);
  }
}

// ── 3 EN RAYA (start + settle) ───────────────────────────────

export async function handleTictactoe(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as {
      userId?: string;
      action?: "start" | "settle";
      amount?: number;
      betId?: string;
      board?: Cell[];
    };
    const { userId, action, amount, betId, board } = body;
    if (!userId || !action) return bad("Faltan parámetros");

    const check = checkUser(userId);
    if (!check.ok) return check.error;
    const user = check.user;

    const config = getGameConfig("tictactoe");
    const cfg = parseConfig(config.configJson);

    // ── INICIO DE PARTIDA ─────────────────────────────
    if (action === "start") {
      if (!config.enabled) return bad("3 en Raya está desactivado temporalmente");
      const amt = ROUND2(Number(amount));
      if (!Number.isFinite(amt) || amt <= 0) return bad("Importe de apuesta inválido");
      if (amt < config.minBet) return bad(`Apuesta mínima: ${config.minBet.toFixed(2)} USD`);
      if (amt > config.maxBet) return bad(`Apuesta máxima: ${config.maxBet.toFixed(2)} USD`);
      if (user.balance < amt) return bad("Saldo insuficiente");

      // Cancela partidas pendientes anteriores (reembolso)
      const pending = findPendingBet(user.id, "tictactoe");
      if (pending) {
        updateBet(pending.id, (b) => {
          b.outcome = "void";
          b.payout = b.amount;
          b.profit = 0;
          b.multiplier = 1;
        });
        updateUser(user.id, (u) => {
          u.balance = ROUND2(u.balance + pending.amount);
        });
      }

      updateUser(user.id, (u) => {
        u.balance = ROUND2(u.balance - amt);
        u.totalWagered = ROUND2(u.totalWagered + amt);
        u.betsCount += 1;
      });
      const bet = insertBet({
        userId: user.id,
        game: "tictactoe",
        betType: "tictactoe",
        amount: amt,
        outcome: "pending",
      });

      return Response.json({
        betId: bet.id,
        balance: ROUND2(getUser(user.id)!.balance),
        winMultiplier: Number(cfg.winMultiplier ?? 2.5),
      });
    }

    // ── FIN DE PARTIDA ────────────────────────────────
    if (action === "settle") {
      if (!betId) return bad("Falta betId");
      const bet = getBet(betId);
      if (!bet || bet.userId !== user.id) return bad("Apuesta no encontrada", 404);
      if (bet.outcome !== "pending") return bad("Esta partida ya fue liquidada");

      const settled = settleTictactoe(board ?? [], bet.amount, cfg);
      if (!settled.ok) {
        // Tablero inválido: reembolso (void)
        updateBet(bet.id, (b) => {
          b.outcome = "void";
          b.payout = b.amount;
          b.profit = 0;
          b.multiplier = 1;
          b.resultJson = JSON.stringify({ error: settled.reason });
        });
        updateUser(user.id, (u) => {
          u.balance = ROUND2(u.balance + bet.amount);
          u.totalWagered = ROUND2(u.totalWagered - bet.amount);
          u.betsCount -= 1;
        });
        return Response.json({
          outcome: "void",
          balance: ROUND2(getUser(user.id)!.balance),
          reason: settled.reason,
        });
      }

      const r = settled.result;
      updateBet(bet.id, (b) => {
        b.outcome = r.outcome;
        b.multiplier = r.multiplier;
        b.payout = r.payout;
        b.profit = ROUND2(r.payout - bet.amount);
        b.resultJson = JSON.stringify(r.resultJson);
      });
      updateUser(user.id, (u) => {
        if (r.outcome === "win") {
          u.winsCount += 1;
          u.totalPayout = ROUND2(u.totalPayout + r.payout);
        } else if (r.outcome === "lose") {
          u.lossesCount += 1;
        } else {
          u.totalPayout = ROUND2(u.totalPayout + r.payout);
        }
        if (r.payout > 0) u.balance = ROUND2(u.balance + r.payout);
      });

      return Response.json({
        outcome: r.outcome,
        multiplier: r.multiplier,
        payout: r.payout,
        profit: ROUND2(r.payout - bet.amount),
        result: r.resultJson,
        balance: ROUND2(getUser(user.id)!.balance),
      });
    }

    return bad("Acción desconocida");
  } catch (e) {
    console.error("POST /api/games/tictactoe", e);
    return bad("Error interno", 500);
  }
}
