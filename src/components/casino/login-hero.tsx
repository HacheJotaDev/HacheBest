"use client";

import { useState } from "react";
import { Dices, Gift, Loader2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCasino } from "@/store/casino";
import { GAME_DESCS, GAME_NAMES } from "@/lib/client";
import { toast } from "sonner";

/** Pantalla de bienvenida + login demo (sin contraseña) */
export function LoginHero() {
  const login = useCasino((s) => s.login);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await login(username);
    setBusy(false);
    if (res.ok) {
      toast.success(
        res.isNew
          ? "¡Bienvenido a HacheBest! Te acreditamos 1.000,00 USD de demo."
          : "¡Bienvenido de vuelta a HacheBest!",
      );
    } else {
      toast.error(res.error ?? "No se pudo entrar");
    }
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
          El casino de apuestas en modo demo. Elige tu juego, haz tu pronóstico y demuestra tu
          suerte con <strong className="text-gold">1.000,00 USD</strong> de saldo ficticio.
        </p>
      </div>

      <Card className="mt-8 mx-auto max-w-md border-gold/30 shadow-2xl shadow-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="size-5 text-gold" aria-hidden />
            Entra en 2 segundos
          </CardTitle>
          <CardDescription>
            Sin registros ni contraseñas: elige tu apodo y juega al instante.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Tu apodo de jugador</Label>
              <Input
                id="username"
                placeholder="Ej: SuerteTotal"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={16}
                autoFocus
                className="h-11"
              />
            </div>
            <Button type="submit" className="w-full h-11 font-bold" disabled={busy || username.trim().length < 2}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Gift className="size-4" aria-hidden />}
              {busy ? "Entrando…" : "Entrar y reclamar 1.000 USD demo"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Object.entries(GAME_NAMES).map(([id, name], i) => (
          <div key={id} className="casino-card p-4 flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="size-4 text-gold" aria-hidden />
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
