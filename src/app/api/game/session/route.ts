import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getGameConfig, parseConfig, ROUND2 } from "@/lib/games";
import {
  actSession,
  blackjackNaturals,
  isSessionGame,
  startSession,
  type Settlement,
  type SessionGameId,
} from "@/lib/games-session";

const GAME_NAMES: Record<SessionGameId, string> = {
  mayormenor: "Mayor o Menor",
  blackjack: "Blackjack",
  mines: "Mines",
  crash: "Crash",
};

/**
 * POST /api/game/session — juegos multi-fase (mayormenor, blackjack, mines, crash)
 *
 * action = "start" → descuenta la apuesta, anula rondas pendientes anteriores
 *                    (reembolso) y crea la partida (bet pending).
 * action = "act"   → ejecuta una acción (guess/cashout/hit/stand/double/reveal/tick).
 *                    Si la ronda termina, liquida la apuesta atómicamente.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      game?: string;
      action?: "start" | "act";
      amount?: number;
      betId?: string;
      act?: string;
      extra?: Record<string, unknown>;
    };
    const { userId, game, action, amount, betId, act } = body;
    const extra = body.extra ?? {};

    if (!userId || !game || !action) {
      return Response.json({ error: "Faltan parámetros" }, { status: 400 });
    }
    if (!isSessionGame(game)) {
      return Response.json({ error: "Juego de sesión desconocido" }, { status: 400 });
    }
    const gameId: SessionGameId = game;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.isBanned) return Response.json({ error: "Cuenta suspendida" }, { status: 403 });

    const config = await getGameConfig(gameId);
    const cfg = parseConfig(config.configJson);
    const name = config.name ?? GAME_NAMES[gameId];

    // ── INICIO DE PARTIDA ─────────────────────────────────────
    if (action === "start") {
      if (!config.enabled) {
        return Response.json({ error: `${name} está desactivado temporalmente` }, { status: 400 });
      }
      const amt = ROUND2(Number(amount));
      if (!Number.isFinite(amt) || amt <= 0) {
        return Response.json({ error: "Importe de apuesta inválido" }, { status: 400 });
      }
      if (amt < config.minBet) {
        return Response.json({ error: `Apuesta mínima: ${config.minBet.toFixed(2)} USD` }, { status: 400 });
      }
      if (amt > config.maxBet) {
        return Response.json({ error: `Apuesta máxima: ${config.maxBet.toFixed(2)} USD` }, { status: 400 });
      }
      if (user.balance < amt) {
        return Response.json({ error: "Saldo insuficiente" }, { status: 400 });
      }

      // Genera el estado inicial ANTES de crear la apuesta (puede fallar por
      // parámetros inválidos, p. ej. número de minas, sin tocar la base de datos)
      const started = startSession(gameId, amt, extra, cfg);
      if ("error" in started) {
        return Response.json({ error: started.error }, { status: 400 });
      }

      // Cancela rondas pendientes anteriores (reembolso)
      const pending = await db.bet.findFirst({
        where: { userId, game: gameId, outcome: "pending" },
      });
      const created = await db.$transaction(async (tx) => {
        if (pending) {
          await tx.bet.update({
            where: { id: pending.id },
            data: { outcome: "void", payout: pending.amount, profit: 0, multiplier: 1 },
          });
          await tx.user.update({
            where: { id: userId },
            data: { balance: { increment: pending.amount } },
          });
        }
        const u = await tx.user.update({
          where: { id: userId },
          data: {
            balance: { decrement: amt },
            totalWagered: { increment: amt },
            betsCount: { increment: 1 },
          },
        });
        const bet = await tx.bet.create({
          data: {
            userId,
            game: gameId,
            betType: "session",
            amount: amt,
            outcome: "pending",
            resultJson: JSON.stringify(started.state),
          },
        });
        return { user: u, bet };
      });

      // Blackjack: comprobar naturals inmediatos
      if (gameId === "blackjack") {
        const nat = blackjackNaturals(
          started.state as Parameters<typeof blackjackNaturals>[0],
          amt,
          cfg,
        );
        if (nat) {
          const res = await settleBetTx(created.bet.id, userId, amt, nat);
          return Response.json({ betId: created.bet.id, balance: res.balance, settled: res.payload });
        }
      }

      return Response.json({
        betId: created.bet.id,
        balance: ROUND2(created.user.balance),
        state: started.publicState,
        serverNow: started.serverNow,
      });
    }

    // ── ACCIÓN DENTRO DE LA PARTIDA ───────────────────────────
    if (action === "act") {
      if (!betId || !act) return Response.json({ error: "Faltan parámetros de acción" }, { status: 400 });
      const bet = await db.bet.findUnique({ where: { id: betId } });
      if (!bet || bet.userId !== userId) {
        return Response.json({ error: "Apuesta no encontrada" }, { status: 404 });
      }
      if (bet.outcome !== "pending") {
        return Response.json({ error: "Esta ronda ya fue liquidada" }, { status: 400 });
      }

      // Pre-chequeo de saldo para doblar en blackjack
      if (gameId === "blackjack" && act === "double" && user.balance < bet.amount) {
        return Response.json({ error: "Saldo insuficiente para doblar" }, { status: 400 });
      }

      let state: unknown = {};
      try {
        state = JSON.parse(bet.resultJson || "{}");
      } catch {
        state = {};
      }

      const outcome = actSession(gameId, { act, extra, state, amount: bet.amount, cfg });
      if (outcome.error) {
        return Response.json({ error: outcome.error }, { status: 400 });
      }

      // Ronda continúa: guardar estado (y apuesta extra si la hay).
      // Si no hay nada que persistir (p. ej. un tick de crash), no tocamos la BD.
      if (!outcome.settlement) {
        const hasState = Boolean(outcome.state);
        const hasStake = Boolean(outcome.extraStake && outcome.extraStake > 0);
        if (!hasState && !hasStake) {
          return Response.json({
            settled: false,
            balance: user.balance,
            state: outcome.publicState,
            serverNow: outcome.serverNow,
          });
        }
        const balance = await db.$transaction(async (tx) => {
          if (hasStake) {
            await tx.user.update({
              where: { id: userId },
              data: {
                balance: { decrement: outcome.extraStake },
                totalWagered: { increment: outcome.extraStake },
              },
            });
          }
          await tx.bet.update({
            where: { id: bet.id },
            data: {
              ...(hasStake ? { amount: ROUND2(bet.amount + (outcome.extraStake ?? 0)) } : {}),
              ...(hasState ? { resultJson: JSON.stringify(outcome.state) } : {}),
            },
          });
          const u = await tx.user.findUnique({ where: { id: userId } });
          return ROUND2(u?.balance ?? user.balance);
        });
        return Response.json({
          settled: false,
          balance,
          state: outcome.publicState,
          serverNow: outcome.serverNow,
        });
      }

      // Ronda terminada: liquidar (incluye apuesta extra de doblar)
      const effAmount = outcome.extraStake ? ROUND2(bet.amount + outcome.extraStake) : bet.amount;
      const res = await settleBetTx(bet.id, userId, effAmount, outcome.settlement, outcome.extraStake);
      return Response.json({ settled: true, balance: res.balance, ...res.payload });
    }

    return Response.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    console.error("POST /api/game/session", e);
    return Response.json({ error: "Error interno al procesar la partida" }, { status: 500 });
  }
}

/** Liquida una apuesta pending: actualiza bet, stats del usuario y paga */
async function settleBetTx(
  betId: string,
  userId: string,
  effAmount: number,
  s: Settlement,
  extraStake?: number,
) {
  const updated = await db.$transaction(async (tx) => {
    if (extraStake && extraStake > 0) {
      await tx.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: extraStake },
          totalWagered: { increment: extraStake },
        },
      });
    }
    await tx.bet.update({
      where: { id: betId },
      data: {
        amount: effAmount,
        outcome: s.outcome,
        multiplier: s.multiplier,
        payout: s.payout,
        profit: ROUND2(s.payout - effAmount),
        resultJson: JSON.stringify(s.resultJson),
      },
    });
    const uu = await tx.user.update({
      where: { id: userId },
      data: {
        ...(s.outcome === "win"
          ? { winsCount: { increment: 1 }, totalPayout: { increment: s.payout } }
          : s.outcome === "lose"
            ? { lossesCount: { increment: 1 } }
            : { totalPayout: { increment: s.payout } }),
      },
    });
    if (s.payout > 0) {
      const b = ROUND2(uu.balance + s.payout);
      await tx.user.update({ where: { id: userId }, data: { balance: b } });
      uu.balance = b;
    }
    return uu;
  });

  return {
    balance: ROUND2(updated.balance),
    payload: {
      outcome: s.outcome,
      multiplier: s.multiplier,
      payout: s.payout,
      profit: ROUND2(s.payout - effAmount),
      result: s.resultJson as Record<string, unknown>,
    },
  };
}
