import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  getGameConfig,
  parseConfig,
  settleTictactoe,
  ROUND2,
  type Cell,
} from "@/lib/games";

/**
 * POST /api/game/tictactoe
 * action = "start"  → descuenta la apuesta y crea la partida (bet pending)
 * action = "settle" → verifica el tablero y liquida la apuesta
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      action?: "start" | "settle";
      amount?: number;
      betId?: string;
      board?: Cell[];
    };
    const { userId, action, amount, betId, board } = body;
    if (!userId || !action) return Response.json({ error: "Faltan parámetros" }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    if (user.isBanned) return Response.json({ error: "Cuenta suspendida" }, { status: 403 });

    const config = await getGameConfig("tictactoe");
    const cfg = parseConfig(config.configJson);

    // ── INICIO DE PARTIDA ─────────────────────────────
    if (action === "start") {
      if (!config.enabled) {
        return Response.json({ error: "3 en Raya está desactivado temporalmente" }, { status: 400 });
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

      // Cancela partidas pendientes anteriores (reembolso)
      const pending = await db.bet.findFirst({
        where: { userId, game: "tictactoe", outcome: "pending" },
      });
      const updated = await db.$transaction(async (tx) => {
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
            game: "tictactoe",
            betType: "tictactoe",
            amount: amt,
            outcome: "pending",
          },
        });
        return { user: u, bet };
      });

      return Response.json({
        betId: updated.bet.id,
        balance: ROUND2(updated.user.balance),
        winMultiplier: Number(cfg.winMultiplier ?? 2.5),
      });
    }

    // ── FIN DE PARTIDA ────────────────────────────────
    if (action === "settle") {
      if (!betId) return Response.json({ error: "Falta betId" }, { status: 400 });
      const bet = await db.bet.findUnique({ where: { id: betId } });
      if (!bet || bet.userId !== userId) {
        return Response.json({ error: "Apuesta no encontrada" }, { status: 404 });
      }
      if (bet.outcome !== "pending") {
        return Response.json({ error: "Esta partida ya fue liquidada" }, { status: 400 });
      }

      const settled = settleTictactoe(board ?? [], bet.amount, cfg);
      if (!settled.ok) {
        // Tablero inválido: se reembolsa la apuesta (void)
        const u = await db.$transaction(async (tx) => {
          await tx.bet.update({
            where: { id: bet.id },
            data: { outcome: "void", payout: bet.amount, profit: 0, multiplier: 1, resultJson: JSON.stringify({ error: settled.reason }) },
          });
          return tx.user.update({
            where: { id: userId },
            data: { balance: { increment: bet.amount }, totalWagered: { decrement: bet.amount }, betsCount: { decrement: 1 } },
          });
        });
        return Response.json({ outcome: "void", balance: ROUND2(u.balance), reason: settled.reason });
      }

      const r = settled.result;
      const u = await db.$transaction(async (tx) => {
        await tx.bet.update({
          where: { id: bet.id },
          data: {
            outcome: r.outcome,
            multiplier: r.multiplier,
            payout: r.payout,
            profit: ROUND2(r.payout - bet.amount),
            resultJson: JSON.stringify(r.resultJson),
          },
        });
        const uu = await tx.user.update({
          where: { id: userId },
          data: {
            ...(r.outcome === "win"
              ? { winsCount: { increment: 1 }, totalPayout: { increment: r.payout } }
              : r.outcome === "lose"
                ? { lossesCount: { increment: 1 } }
                : { totalPayout: { increment: r.payout } }),
          },
        });
        if (r.payout > 0) {
          const b = ROUND2(uu.balance + r.payout);
          await tx.user.update({ where: { id: userId }, data: { balance: b } });
          uu.balance = b;
        }
        return uu;
      });

      return Response.json({
        outcome: r.outcome,
        multiplier: r.multiplier,
        payout: r.payout,
        profit: ROUND2(r.payout - bet.amount),
        result: r.resultJson,
        balance: ROUND2(u.balance),
      });
    }

    return Response.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (e) {
    console.error("POST /api/game/tictactoe", e);
    return Response.json({ error: "Error interno" }, { status: 500 });
  }
}
