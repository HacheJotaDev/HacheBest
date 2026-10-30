import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  GAMES,
  getGameConfig,
  parseConfig,
  playInstant,
  validateBet,
  ROUND2,
  type GameId,
} from "@/lib/games";

/**
 * POST /api/game/play — apuestas instantáneas
 * body: { userId, game, betType, amount, extra? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      game?: string;
      betType?: string;
      amount?: number;
      extra?: Record<string, unknown>;
    };
    const { userId, game, betType = "", amount } = body;
    const extra = body.extra ?? {};

    if (!userId || !game || amount === undefined) {
      return Response.json({ error: "Faltan parámetros" }, { status: 400 });
    }
    if (!(GAMES as readonly string[]).includes(game)) {
      return Response.json({ error: "Juego desconocido" }, { status: 400 });
    }
    const gameId = game as GameId;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.isBanned) return Response.json({ error: "Cuenta suspendida" }, { status: 403 });

    const config = await getGameConfig(gameId);
    if (!config.enabled) {
      return Response.json({ error: `${config.name} está desactivado temporalmente` }, { status: 400 });
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

    const betError = validateBet(gameId, betType, extra);
    if (betError) return Response.json({ error: betError }, { status: 400 });

    const cfg = parseConfig(config.configJson);
    const result = playInstant(gameId, { amount: amt, betType, extra, cfg });

    // Transacción: descontar apuesta, pagar premio, actualizar stats y guardar apuesta
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: {
          balance: { decrement: amt },
          totalWagered: { increment: amt },
          betsCount: { increment: 1 },
          ...(result.outcome === "win"
            ? {
                winsCount: { increment: 1 },
                totalPayout: { increment: result.payout },
              }
            : result.outcome === "lose"
              ? { lossesCount: { increment: 1 } }
              : { totalPayout: { increment: result.payout } }),
        },
      });
      // El payout se devuelve inmediatamente (win: premio, draw: devolución)
      if (result.payout > 0) {
        u.balance = ROUND2(u.balance + result.payout);
        await tx.user.update({ where: { id: userId }, data: { balance: u.balance } });
      }
      await tx.bet.create({
        data: {
          userId,
          game: gameId,
          betType,
          amount: amt,
          multiplier: result.multiplier,
          payout: result.payout,
          profit: ROUND2(result.payout - amt),
          outcome: result.outcome,
          resultJson: JSON.stringify(result.resultJson),
        },
      });
      return u;
    });

    return Response.json({
      outcome: result.outcome,
      multiplier: result.multiplier,
      payout: result.payout,
      profit: ROUND2(result.payout - amt),
      result: result.resultJson,
      balance: ROUND2(updated.balance),
    });
  } catch (e) {
    console.error("POST /api/game/play", e);
    return Response.json({ error: "Error interno al procesar la apuesta" }, { status: 500 });
  }
}
