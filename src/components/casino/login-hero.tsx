"use client";

import { useState } from "react";
import { Dices, Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCasino } from "@/store/casino";
import { GAME_DESCS, GAME_NAMES } from "@/lib/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────
// Puerta de entrada del casino: usuario + contraseña.
// Si el usuario no existe, la cuenta se crea al instante.
// ─────────────────────────────────────────────────────────────

export function LoginHero() {
  const login = useCasino((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await login(username.trim(), password);
    if (res.ok) {
      toast.success(
        res.isNew
          ? "¡Cuenta creada! Bienvenido a HacheBest: 1.000,00 USD de demo acreditados."
          : res.claimed
            ? "Cuenta protegida con tu contraseña. ¡Bienvenido de vuelta!"
            : "¡Bienvenido de vuelta a HacheBest!",
      );
      // El casino es una sola página ("/"): las demás vistas son
      // estados internos, así que tras entrar siempre se va al lobby.
      window.location.replace("/");
      return; // navegando… no reactivar el botón
    }
    setBusy(false);
    toast.error(res.error ?? "No se pudo entrar");
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center text-center gap-3">
        <span className="grid place-items-center size-16 rounded-2xl bg-gradient-to-br from-gold to-amber-600 shadow-xl shadow-amber-500/25">
          <Dices className="size-9 text-amber-950" aria-hidden />
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          Hache<span className="text-gold-gradient">Best</span>
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Acceso de jugadores. Entra con tu cuenta y demuestra tu suerte con{" "}
          <strong className="text-gold">1.000,00 USD</strong> de saldo demo.
        </p>
      </div>

      <Card className="mt-8 mx-auto max-w-md border-gold/30 shadow-2xl shadow-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <LogIn className="size-5 text-gold" aria-hidden />
            Acceso de jugadores
          </CardTitle>
          <CardDescription>
            Introduce tu usuario y contraseña para entrar al casino.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                placeholder="Tu usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={16}
                autoFocus
                autoComplete="username"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={64}
                autoComplete="current-password"
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 font-bold"
              disabled={busy || username.trim().length < 2 || password.length < 4}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <LogIn className="size-4" aria-hidden />
              )}
              {busy ? "Entrando…" : "Entrar al casino"}
            </Button>
            <p className="flex items-start gap-2 rounded-lg border border-gold/20 bg-gold/5 p-3 text-xs leading-relaxed text-muted-foreground">
              <UserPlus className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
              <span>
                ¿Aún no tienes cuenta? <strong className="text-foreground">Escribe el usuario
                y la contraseña que quieras</strong> y tu cuenta se crea al instante con{" "}
                1.000,00 USD de saldo demo. Guárdalos bien: con ellos entras siempre.
              </span>
            </p>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 text-gold" aria-hidden />
        Tu contraseña se guarda cifrada y tu sesión viaja siempre protegida.
      </p>

      <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Object.entries(GAME_NAMES).map(([id, name], i) => (
          <div key={id} className="casino-card p-4 flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-bold">
              <Dices className="size-4 text-gold" aria-hidden />
              {name}
            </span>
            <span className="text-xs text-muted-foreground leading-relaxed">
              {GAME_DESCS[id] ?? ""}
            </span>
            <span className="mt-auto pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              Juego {String(i + 1).padStart(2, "0")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
