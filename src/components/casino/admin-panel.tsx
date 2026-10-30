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
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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

interface HouseInfo {
  settings: { userWinPercent: number; protection: boolean };
  houseProfit: number;
  deficit: number;
  effectiveWinRate: number;
  bank?: BankInfo;
}

/** Banca de la casa: fondos reales que pagan las apuestas */
interface BankInfo {
  fondos: number;
  capital: number;
  retirado: number;
  gananciaNeta: number;
  retirable: number;
  abierta: boolean;
  withdrawals: Array<{ id: string; amount: number; at: string }>;
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
  const [house, setHouse] = useState<HouseInfo | null>(null);
  const [bigWins, setBigWins] = useState<BigWin[]>([]);
  const [recent, setRecent] = useState<AdminBet[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [resStats, resBets] = await Promise.all([
      api<{ stats: AdminStats; bigWins: BigWin[]; house: HouseInfo }>("/api/admin/stats", { adminKey }),
      api<{ bets: AdminBet[] }>("/api/admin/bets?limit=15", { adminKey }),
    ]);
    if (resStats.ok) {
      setStats(resStats.data.stats);
      setBigWins(resStats.data.bigWins);
      setHouse(resStats.data.house);
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
    {
      label: "Fondos de la banca",
      value: house?.bank ? fmtUSD(house.bank.fondos) : "—",
      sub: house?.bank ? `Capital ${fmtUSD(house.bank.capital)} · ${house.bank.abierta ? "casino abierto" : "CASINO CERRADO"}` : "",
      highlight: (house?.bank?.fondos ?? 0) > 0 ? "text-gold" : "text-lose",
    },
    {
      label: "Retirable (ganancias)",
      value: house?.bank ? fmtUSD(house.bank.retirable) : "—",
      sub: house?.bank ? `Ya retirado: ${fmtUSD(house.bank.retirado)}` : "",
      highlight: "text-win",
    },
  ];

  return (
    <div className="space-y-4">
      {house && (
        <div className="casino-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Shield
              className={`size-8 shrink-0 ${house.settings.protection ? "text-win" : "text-lose"}`}
              aria-hidden
            />
            <div>
              <p className="text-sm font-bold">
                Protección de la casa: {house.settings.protection ? "ACTIVA" : "DESACTIVADA"}
              </p>
              <p className="text-xs text-muted-foreground">
                Base {house.settings.userWinPercent}% · prob. efectiva del usuario {house.effectiveWinRate}% ·
                déficit de la banca {fmtUSD(house.deficit)}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-gold/40 text-gold">
            Mecánica 50/50
          </Badge>
        </div>
      )}

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
  return (
    <div className="space-y-4">
      <HouseForm adminKey={adminKey} />
      <PasswordForm adminKey={adminKey} />
    </div>
  );
}

// ── LA CASA (50/50 + protección) ─────────────────────────────

function HouseForm({ adminKey }: { adminKey: string }) {
  const [info, setInfo] = useState<HouseInfo | null>(null);
  const [win, setWin] = useState(50);
  const [prot, setProt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retiro, setRetiro] = useState("");
  const [recarga, setRecarga] = useState("");
  const [busyBank, setBusyBank] = useState<"retirar" | "recapitalizar" | null>(null);

  const refresh = useCallback(async () => {
    const res = await api<HouseInfo>("/api/admin/house", { adminKey });
    if (res.ok) {
      setInfo(res.data);
      setWin(res.data.settings.userWinPercent);
      setProt(res.data.settings.protection);
    }
  }, [adminKey]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const save = async () => {
    setBusy(true);
    const res = await api<HouseInfo & { ok: boolean }>("/api/admin/house", {
      method: "PUT",
      body: { userWinPercent: win, protection: prot },
      adminKey,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setInfo(res.data);
    setWin(res.data.settings.userWinPercent);
    setProt(res.data.settings.protection);
    toast.success("Cerebro de la casa actualizado");
  };

  const bankAction = async (action: "retirar" | "recapitalizar", amount: number) => {
    setBusyBank(action);
    const res = await api<{ ok: boolean; bank: BankInfo; mensaje: string }>("/api/admin/house/bank", {
      method: "POST",
      body: { action, amount },
      adminKey,
    });
    setBusyBank(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setInfo((prev) => (prev ? { ...prev, bank: res.data.bank } : prev));
    if (action === "retirar") {
      toast.success(res.data.mensaje);
      setRetiro("");
    } else {
      toast.success(res.data.mensaje);
      setRecarga("");
    }
  };

  return (
    <div className="casino-card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Shield className="size-5 text-gold" aria-hidden />
        <p className="font-bold">La Casa — mecánica 50/50 + protección</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-border/60 bg-background/50 p-2">
          <p className="text-xs text-muted-foreground">Beneficio casa</p>
          <p className={`font-extrabold tabular ${(info?.houseProfit ?? 0) >= 0 ? "text-win" : "text-lose"}`}>
            {fmtUSD(info?.houseProfit ?? 0)}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/50 p-2">
          <p className="text-xs text-muted-foreground">Déficit</p>
          <p className="font-extrabold tabular text-lose">{fmtUSD(info?.deficit ?? 0)}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/50 p-2">
          <p className="text-xs text-muted-foreground">Prob. efectiva usuario</p>
          <p className="font-extrabold tabular text-gold">{info?.effectiveWinRate ?? win}%</p>
        </div>
      </div>

      {info?.bank && (
        <div className="space-y-3 rounded-lg border border-gold/30 bg-gold/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-gold" aria-hidden />
              <p className="text-sm font-bold">Banca de la casa</p>
            </div>
            <Badge
              variant="outline"
              className={
                info.bank.abierta
                  ? "border-win/50 text-win"
                  : "border-lose/60 bg-lose/10 text-lose animate-pulse"
              }
            >
              {info.bank.abierta ? "CASINO ABIERTO" : "CASINO CERRADO · SIN FONDOS"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-md border border-border/60 bg-background/50 p-2">
              <p className="text-[11px] text-muted-foreground">Fondos</p>
              <p className={`font-extrabold tabular ${info.bank.fondos > 0 ? "text-gold" : "text-lose"}`}>
                {fmtUSD(info.bank.fondos)}
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-background/50 p-2">
              <p className="text-[11px] text-muted-foreground">Capital puesto</p>
              <p className="font-extrabold tabular">{fmtUSD(info.bank.capital)}</p>
            </div>
            <div className="rounded-md border border-border/60 bg-background/50 p-2">
              <p className="text-[11px] text-muted-foreground">Ganancia neta</p>
              <p className={`font-extrabold tabular ${info.bank.gananciaNeta >= 0 ? "text-win" : "text-lose"}`}>
                {fmtUSD(info.bank.gananciaNeta)}
              </p>
            </div>
            <div className="rounded-md border border-border/60 bg-background/50 p-2">
              <p className="text-[11px] text-muted-foreground">Retirable</p>
              <p className="font-extrabold tabular text-win">{fmtUSD(info.bank.retirable)}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-md border border-border/60 bg-background/50 p-3">
              <Label htmlFor="retiro-amt" className="text-xs">
                Retirar ganancias (máx. {fmtUSD(info.bank.retirable)})
              </Label>
              <div className="flex gap-2">
                <Input
                  id="retiro-amt"
                  type="number"
                  min={0}
                  max={info.bank.retirable}
                  step="0.01"
                  placeholder="0.00"
                  value={retiro}
                  onChange={(e) => setRetiro(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  disabled={info.bank.retirable <= 0}
                  onClick={() => setRetiro(info.bank.retirable.toFixed(2))}
                >
                  Todo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-1"
                  disabled={busyBank !== null || !(Number(retiro) > 0)}
                  onClick={() => void bankAction("retirar", Number(retiro))}
                >
                  {busyBank === "retirar" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
                  Retirar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                El capital ({fmtUSD(info.bank.capital)}) queda en la banca para pagar apuestas.
              </p>
            </div>

            <div className="space-y-2 rounded-md border border-border/60 bg-background/50 p-3">
              <Label htmlFor="recarga-amt" className="text-xs">
                Recargar banca (capital del dueño)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="recarga-amt"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="100.00"
                  value={recarga}
                  onChange={(e) => setRecarga(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-1"
                  disabled={busyBank !== null || !(Number(recarga) > 0)}
                  onClick={() => void bankAction("recapitalizar", Number(recarga))}
                >
                  {busyBank === "recapitalizar" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Coins className="size-4" aria-hidden />}
                  Recargar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Con más fondos suben los límites de apuesta de todos los juegos.
              </p>
            </div>
          </div>

          {info.bank.withdrawals.length > 0 && (
            <div className="rounded-md border border-border/60 bg-background/50 p-2">
              <p className="px-1 pb-1 text-[11px] font-bold uppercase text-muted-foreground">Últimas retiradas</p>
              <ScrollArea className="max-h-28">
                {info.bank.withdrawals.slice(0, 8).map((w) => (
                  <div key={w.id} className="flex items-center justify-between px-1 py-0.5 text-xs">
                    <span className="tabular font-bold text-win">+{fmtUSD(w.amount)}</span>
                    <span className="text-muted-foreground">{fmtTime(w.at)}</span>
                  </div>
                ))}
              </ScrollArea>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Probabilidad de victoria del usuario (juegos parejos)</Label>
          <span className="text-sm font-extrabold tabular text-gold">{win}%</span>
        </div>
        <Slider
          value={[win]}
          min={30}
          max={70}
          step={1}
          onValueChange={(v) => setWin(v[0] ?? 50)}
          aria-label="Probabilidad de victoria del usuario"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>30% (más difícil para el usuario)</span>
          <span>70% (más fácil)</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
        <div>
          <p className="text-sm font-bold">Protección de la banca</p>
          <p className="text-xs text-muted-foreground">
            Si la casa acumula pérdidas, baja la probabilidad del usuario (hasta 38%), sube la
            ventaja en dado/mayor-menor/mines/crash (+12 pts máx.) y la IA del 3 en raya juega
            casi perfecta.
          </p>
        </div>
        <Switch checked={prot} onCheckedChange={setProt} aria-label="Protección de la banca" />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={busy} className="gap-1.5">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          Guardar ajustes
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Juegos parejos con 50/50 decidido por la casa: Par o Impar, Cara o Cruz, Piedra-Papel-Tijera
        y Carta Más Alta. La ruleta, el número exacto y la tragamonedas mantienen su ventaja natural.
      </p>
    </div>
  );
}

function PasswordForm({ adminKey }: { adminKey: string }) {
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
      <div className="flex items-center gap-2">
        <KeyRound className="size-5 text-primary" aria-hidden />
        <p className="font-bold">Contraseña del panel</p>
      </div>
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
