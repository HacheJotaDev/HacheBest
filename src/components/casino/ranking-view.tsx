"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Medal, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, fmtUSD } from "@/lib/client";
import { useCasino } from "@/store/casino";

interface LeaderRow {
  id: string;
  username: string;
  balance: number;
  totalWagered: number;
  betsCount: number;
  winsCount: number;
}

/** Ranking de jugadores por saldo demo */
export function RankingView() {
  const user = useCasino((s) => s.user);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api<{ users: LeaderRow[] }>("/api/leaderboard");
    if (res.ok) setRows(res.data.users);
    setLoading(false);
  }, []);

  const refresh = () => {
    setLoading(true);
    void load();
  };

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, user?.balance]);

  const medalFor = (pos: number) => {
    if (pos === 1) return <Crown className="size-4 text-gold" aria-hidden />;
    if (pos === 2) return <Medal className="size-4 text-zinc-300" aria-hidden />;
    if (pos === 3) return <Medal className="size-4 text-amber-700" aria-hidden />;
    return <span className="text-xs text-muted-foreground tabular">#{pos}</span>;
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <Trophy className="size-6 text-gold" aria-hidden /> Ranking de jugadores
          </h2>
          <p className="text-sm text-muted-foreground">Top 10 por saldo demo</p>
        </div>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={refresh} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> Actualizar
        </Button>
      </div>

      <div className="casino-card overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="py-14 text-center text-muted-foreground text-sm">Cargando ranking…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-muted-foreground">
            <Trophy className="size-10 opacity-40" aria-hidden />
            <p>Todavía no hay jugadores clasificados. ¡Sé el primero!</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Pos</TableHead>
                <TableHead>Jugador</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Apostado</TableHead>
                <TableHead className="text-right">Apuestas</TableHead>
                <TableHead className="text-right">Victorias</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id} className={r.id === user?.id ? "bg-primary/5" : ""}>
                  <TableCell>{medalFor(i + 1)}</TableCell>
                  <TableCell className="font-bold">
                    <span className="uppercase">{r.username}</span>
                    {r.id === user?.id && (
                      <span className="ml-2 text-[10px] uppercase text-primary font-bold">Tú</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular font-bold text-gold">
                    {fmtUSD(r.balance)}
                  </TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">
                    {fmtUSD(r.totalWagered)}
                  </TableCell>
                  <TableCell className="text-right tabular">{r.betsCount}</TableCell>
                  <TableCell className="text-right tabular text-win">{r.winsCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
