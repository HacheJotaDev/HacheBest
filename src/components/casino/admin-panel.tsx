"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  BarChart3,
  Coins,
  Gamepad2,
  KeyRound,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Settings2,
  Users,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, GAME_NAMES, fmtTime, fmtUSD } from "@/lib/client";
import { toast } from "sonner";

const ADMIN_KEY_STORAGE = "hachebest.admin";

// ─────────────────────────────────────────────────────────────
// Panel de administración de HacheBest (usado por la página /admin)
// ─────────────────────────────────────────────────────────────

interface AdminStats {
  totalUsers: number;
  bannedUsers: number;
  activeUsers: number;
  totalBets: number;
  totalWagered: number;
  totalPayout: number;
  houseProfit: number;
  avgBet: number;
}

interface BigWin {
  id: string;
  username: string;
  game: string;
  amount: number;
  profit: number;
  multiplier: number;
  createdAt: string;
}

interface AdminBet {
  id: string;
  game: string;
  gameName: string;
  betType: string;
  amount: number;
  multiplier: number;
  payout: number;
  profit: number;
  outcome: string;
  createdAt: string;
}

interface AdminUser {
  id: string;
  username: string;
  balance: number;
  totalWagered: number;
  betsCount: number;
  winsCount: number;
  lossesCount: number;
  isBanned: boolean;
  createdAt: string;
}

interface AdminGame {
  game: string;
  name: string;
  enabled: boolean;
  minBet: number;
  maxBet: number;
  configJson: string;
}

export function AdminPanel({ active = true }: { active?: boolean }) {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Recupera la sesión de admin de esta pestaña
  useEffect(() => {
    const t = setTimeout(() => {
      const saved = window.sessionStorage.getItem(ADMIN_KEY_STORAGE);
      if (saved) setAdminKey(saved);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const loginAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ ok: boolean }>("/api/admin", { body: { password } });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    window.sessionStorage.setItem(ADMIN_KEY_STORAGE, password);
    setAdminKey(password);
    toast.success("Acceso concedido");
  };

  const logoutAdmin = () => {
    window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey(null);
    toast.info("Sesión de administrador cerrada");
  };

  if (!adminKey) {
    return (
      <form onSubmit={loginAdmin} className="space-y-4 py-4">
        <div className="mx-auto flex max-w-xs flex-col items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/15">
            <Lock className="size-6 text-primary" aria-hidden />
          </span>
          <p className="text-sm text-muted-foreground">
            Introduce la contraseña de administrador para acceder al panel.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-pass">Contraseña</Label>
          <Input
            id="admin-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Por defecto: admin123"
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
          Entrar
        </Button>
      </form>
    );
  }

  return (
    <Tabs defaultValue="resumen" className="flex-1 min-h-0 flex flex-col gap-4 mt-2">
      <div className="flex items-center justify-between gap-2">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="resumen" className="gap-1.5">
            <BarChart3 className="size-4" aria-hidden /> <span className="hidden sm:inline">Resumen</span>
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-1.5">
            <Users className="size-4" aria-hidden /> <span className="hidden sm:inline">Usuarios</span>
          </TabsTrigger>
          <TabsTrigger value="juegos" className="gap-1.5">
            <Gamepad2 className="size-4" aria-hidden /> <span className="hidden sm:inline">Juegos</span>
          </TabsTrigger>
          <TabsTrigger value="ajustes" className="gap-1.5">
            <Settings2 className="size-4" aria-hidden /> <span className="hidden sm:inline">Ajustes</span>
          </TabsTrigger>
        </TabsList>
        <Button variant="ghost" size="sm" onClick={logoutAdmin} className="text-muted-foreground shrink-0">
          Salir
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        <TabsContent value="resumen" className="mt-0">
          <StatsTab adminKey={adminKey} active={active} />
        </TabsContent>
        <TabsContent value="usuarios" className="mt-0">
          <UsersTab adminKey={adminKey} active={active} />
        </TabsContent>
        <TabsContent value="juegos" className="mt-0">
          <GamesTab adminKey={adminKey} active={active} />
        </TabsContent>
        <TabsContent value="ajustes" className="mt-0">
          <SettingsTab adminKey={adminKey} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// ── RESUMEN ──────────────────────────────────────────────────

function StatsTab({ adminKey, active }: { adminKey: string; active: boolean }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [bigWins, setBigWins] = useState<BigWin[]>([]);
  const [recent, setRecent] = useState<AdminBet[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [resStats, resBets] = await Promise.all([
      api<{ stats: AdminStats; bigWins: BigWin[] }>("/api/admin/stats", { adminKey }),
      api<{ bets: AdminBet[] }>("/api/admin/bets?limit=15", { adminKey }),
    ]);
    if (resStats.ok) {
      setStats(resStats.data.stats);
      setBigWins(resStats.data.bigWins);
    } else {
      toast.error(resStats.error);
    }
    if (resBets.ok) setRecent(resBets.data.bets);
    setLoading(false);
  }, [adminKey]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => void load(), 0);
    const interval = setInterval(() => void load(), 10000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [load, active]);

  if (loading && !stats) {
    return <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!stats) return null;

  const cards = [
    { label: "Usuarios", value: String(stats.totalUsers), sub: `${stats.activeUsers} activos · ${stats.bannedUsers} suspendidos` },
    { label: "Apuestas", value: stats.totalBets.toLocaleString("es-ES"), sub: `Media ${fmtUSD(stats.avgBet)}` },
    { label: "Total apostado", value: fmtUSD(stats.totalWagered), sub: `Pagado: ${fmtUSD(stats.totalPayout)}` },
    { label: "Beneficio de la casa", value: fmtUSD(stats.houseProfit), sub: "", highlight: stats.houseProfit >= 0 ? "text-win" : "text-lose" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="casino-card p-4">
            <p className="text-xs uppercase text-muted-foreground">{c.label}</p>
            <p className={`text-xl font-extrabold tabular ${c.highlight ?? ""}`}>{c.value}</p>
            {c.sub && <p className="text-xs text-muted-foreground">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="casino-card overflow-hidden">
        <p className="border-b border-border/60 px-4 py-2 text-sm font-bold flex items-center gap-2">
          <Coins className="size-4 text-gold" aria-hidden /> Mayores premios
        </p>
        {bigWins.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Sin premios todavía</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jugador</TableHead>
                <TableHead>Juego</TableHead>
                <TableHead className="text-right">Apuesta</TableHead>
                <TableHead className="text-right">Premio</TableHead>
                <TableHead className="text-right">Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bigWins.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-bold uppercase">{w.username}</TableCell>
                  <TableCell>{GAME_NAMES[w.game] ?? w.game}</TableCell>
                  <TableCell className="text-right tabular">{fmtUSD(w.amount)}</TableCell>
                  <TableCell className="text-right tabular font-bold text-win">+{fmtUSD(w.profit)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{fmtTime(w.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="casino-card overflow-hidden">
        <p className="border-b border-border/60 px-4 py-2 text-sm font-bold flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" aria-hidden /> Últimas apuestas (tiempo real)
        </p>
        <ScrollArea className="max-h-72">
          {recent.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aún no hay apuestas</p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Juego</TableHead>
                  <TableHead className="text-right">Apuesta</TableHead>
                  <TableHead className="text-right">Mult.</TableHead>
                  <TableHead className="text-right">Beneficio</TableHead>
                  <TableHead className="text-right">Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <span className="font-semibold">{b.gameName}</span>
                      <Badge
                        variant="outline"
                        className={`ml-2 ${
                          b.outcome === "win"
                            ? "border-win/40 text-win"
                            : b.outcome === "lose"
                              ? "border-lose/40 text-lose"
                              : "border-border text-muted-foreground"
                        }`}
                      >
                        {b.outcome === "win" ? "ganó" : b.outcome === "lose" ? "perdió" : b.outcome}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular">{fmtUSD(b.amount)}</TableCell>
                    <TableCell className="text-right tabular">{b.multiplier}x</TableCell>
                    <TableCell className={`text-right tabular font-bold ${b.profit > 0 ? "text-win" : b.profit < 0 ? "text-lose" : ""}`}>
                      {b.profit > 0 ? "+" : ""}{fmtUSD(b.profit)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{fmtTime(b.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// ── USUARIOS ─────────────────────────────────────────────────

function UsersTab({ adminKey, active }: { adminKey: string; active: boolean }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await api<{ users: AdminUser[] }>("/api/admin/users", { adminKey });
    if (res.ok) setUsers(res.data.users);
    else toast.error(res.error);
    setLoading(false);
  }, [adminKey]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, active]);

  const act = async (userId: string, action: "ban" | "unban" | "reset" | "setBalance", value?: number) => {
    const res = await api<{ user: AdminUser }>("/api/admin/users", {
      method: "PATCH",
      body: { userId, action, value },
      adminKey,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setUsers((us) => us.map((u) => (u.id === userId ? res.data.user : u)));
    toast.success("Usuario actualizado");
  };

  if (loading && users.length === 0) {
    return <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="casino-card overflow-hidden">
      <ScrollArea className="max-h-[55vh]">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Apostado</TableHead>
              <TableHead className="text-right">V/L</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-bold uppercase">{u.username}</TableCell>
                <TableCell className="text-right tabular text-gold font-bold">{fmtUSD(u.balance)}</TableCell>
                <TableCell className="text-right tabular text-muted-foreground">{fmtUSD(u.totalWagered)}</TableCell>
                <TableCell className="text-right tabular">
                  <span className="text-win">{u.winsCount}</span>/<span className="text-lose">{u.lossesCount}</span>
                </TableCell>
                <TableCell className="text-center">
                  {u.isBanned ? (
                    <Badge variant="destructive">Suspendido</Badge>
                  ) : (
                    <Badge variant="outline" className="border-win/40 text-win">Activo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Saldo"
                      value={edits[u.id] ?? ""}
                      onChange={(e) => setEdits((m) => ({ ...m, [u.id]: e.target.value }))}
                      className="h-8 w-24 text-xs"
                      aria-label={`Nuevo saldo de ${u.username}`}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2"
                      disabled={!edits[u.id]}
                      onClick={() => void act(u.id, "setBalance", Number(edits[u.id]))}
                      title="Fijar saldo"
                    >
                      <Save className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => void act(u.id, "reset")}
                      title="Resetear a 1.000 USD"
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant={u.isBanned ? "secondary" : "destructive"}
                      className="h-8 px-2"
                      onClick={() => void act(u.id, u.isBanned ? "unban" : "ban")}
                      title={u.isBanned ? "Reactivar" : "Suspender"}
                    >
                      <Ban className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

// ── JUEGOS ───────────────────────────────────────────────────

const CONFIG_LABELS: Record<string, string> = {
  multiplier: "Multiplicador",
  winMultiplier: "Multiplicador victoria",
  houseEdge: "Ventaja casa (%)",
  drawRefund: "Empate devuelve",
  pleno: "Pago pleno",
  doble: "Pago simple",
  docena: "Pago docena",
  maxPrize: "Premio máximo",
  segments: "Segmentos",
  rows: "Filas",
  blackjackPays: "Blackjack paga",
  winPays: "Victoria paga",
  edge: "Ventaja casa (%)",
  growth: "Velocidad (%/s)",
};

function GamesTab({ adminKey, active }: { adminKey: string; active: boolean }) {
  const [games, setGames] = useState<AdminGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { minBet: string; maxBet: string; cfg: Record<string, number | boolean> }>>({});

  const load = useCallback(async () => {
    const res = await api<{ games: AdminGame[] }>("/api/admin/games", { adminKey });
    if (res.ok) {
      setGames(res.data.games);
      const d: typeof drafts = {};
      for (const g of res.data.games) {
        let cfg: Record<string, number | boolean> = {};
        try {
          cfg = JSON.parse(g.configJson) as Record<string, number | boolean>;
        } catch {
          /* ignore */
        }
        d[g.game] = { minBet: String(g.minBet), maxBet: String(g.maxBet), cfg };
      }
      setDrafts(d);
    } else {
      toast.error(res.error);
    }
    setLoading(false);
  }, [adminKey]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, active]);

  const save = async (game: string) => {
    const draft = drafts[game];
    if (!draft) return;
    setSaving(game);
    const res = await api<{ game: AdminGame }>("/api/admin/games", {
      method: "PUT",
      body: {
        game,
        minBet: Number(draft.minBet),
        maxBet: Number(draft.maxBet),
        configJson: JSON.stringify(draft.cfg),
      },
      adminKey,
    });
    setSaving(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setGames((gs) => gs.map((g) => (g.game === game ? res.data.game : g)));
    toast.success(`${GAME_NAMES[game] ?? game} actualizado`);
  };

  const toggle = async (game: string, enabled: boolean) => {
    const res = await api<{ game: AdminGame }>("/api/admin/games", {
      method: "PUT",
      body: { game, enabled },
      adminKey,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setGames((gs) => gs.map((g) => (g.game === game ? res.data.game : g)));
    toast.success(enabled ? "Juego activado" : "Juego en mantenimiento");
  };

  if (loading && games.length === 0) {
    return <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      {games.map((g) => {
        const draft = drafts[g.game];
        if (!draft) return null;
        return (
          <div key={g.game} className="casino-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">{g.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{g.enabled ? "Activo" : "Mantenimiento"}</span>
                <Switch checked={g.enabled} onCheckedChange={(v) => void toggle(g.game, v)} aria-label={`Activar ${g.name}`} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Apuesta mín.</Label>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={draft.minBet}
                  onChange={(e) => setDrafts((m) => ({ ...m, [g.game]: { ...draft, minBet: e.target.value } }))}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Apuesta máx.</Label>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={draft.maxBet}
                  onChange={(e) => setDrafts((m) => ({ ...m, [g.game]: { ...draft, maxBet: e.target.value } }))}
                  className="h-8"
                />
              </div>
              {Object.entries(draft.cfg).map(([k, v]) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs">{CONFIG_LABELS[k] ?? k}</Label>
                  {typeof v === "boolean" ? (
                    <div className="flex h-8 items-center">
                      <Switch
                        checked={v}
                        onCheckedChange={(nv) =>
                          setDrafts((m) => ({ ...m, [g.game]: { ...draft, cfg: { ...draft.cfg, [k]: nv } } }))
                        }
                        aria-label={CONFIG_LABELS[k] ?? k}
                      />
                    </div>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={String(v)}
                      onChange={(e) =>
                        setDrafts((m) => ({
                          ...m,
                          [g.game]: { ...draft, cfg: { ...draft.cfg, [k]: Number(e.target.value) } },
                        }))
                      }
                      className="h-8"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="gap-1.5" disabled={saving === g.game} onClick={() => void save(g.game)}>
                {saving === g.game ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
                Guardar
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── AJUSTES ──────────────────────────────────────────────────

function SettingsTab({ adminKey }: { adminKey: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await api("/api/admin/settings", {
      method: "PUT",
      body: { currentPassword: current, newPassword: next },
      adminKey,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    window.sessionStorage.setItem(ADMIN_KEY_STORAGE, next);
    toast.success("Contraseña actualizada");
    setCurrent("");
    setNext("");
  };

  return (
    <form onSubmit={submit} className="casino-card mx-auto max-w-sm space-y-4 p-4">
      <div className="space-y-2">
        <Label htmlFor="cur-pass">Contraseña actual</Label>
        <Input id="cur-pass" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-pass">Nueva contraseña</Label>
        <Input id="new-pass" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={5} />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !current || next.length < 5}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
        Cambiar contraseña
      </Button>
      <p className="text-xs text-muted-foreground">
        Mínimo 5 caracteres. También puedes definirla con la variable de entorno <code>ADMIN_PASSWORD</code> en Vercel.
      </p>
    </form>
  );
}
