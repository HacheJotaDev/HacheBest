"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Coins,
  Dices,
  History,
  LogOut,
  RotateCcw,
  Trophy,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCasino, type View } from "@/store/casino";
import { AnimatedNumber } from "./animated-number";
import { fmtUSD } from "@/lib/client";
import { toast } from "sonner";

function Logo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <span className="grid place-items-center size-9 rounded-lg bg-gradient-to-br from-gold to-amber-600 shadow-lg shadow-amber-500/20">
        <Dices className="size-5 text-amber-950" aria-hidden />
      </span>
      <span className="text-lg font-extrabold tracking-tight">
        Hache<span className="text-gold-gradient">Best</span>
      </span>
    </div>
  );
}

const NAV: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "casino", label: "Casino", icon: Dices },
  { id: "historial", label: "Historial", icon: History },
  { id: "ranking", label: "Ranking", icon: Trophy },
];

export function Header() {
  const router = useRouter();
  const { user, view, setView, logout, resetBalance } = useCasino();
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    // prefetch de la ruta raíz para navegación instantánea
    router.prefetch("/");
  }, [router]);

  const onReset = async () => {
    setResetting(true);
    const res = await resetBalance();
    setResetting(false);
    if (res.ok) toast.success("Saldo demo recargado: 1.000,00 USD");
    else toast.error(res.error ?? "No se pudo recargar");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 sm:px-4">
        <div className="flex h-14 items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              useCasino.setState({ activeGame: null });
              setView("casino");
            }}
            className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            aria-label="Ir al lobby del casino"
          >
            <Logo />
          </button>

          {/* Navegación desktop */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Secciones">
            {NAV.map((n) => (
              <Button
                key={n.id}
                variant={view === n.id ? "secondary" : "ghost"}
                size="sm"
                className={`gap-1.5 ${view === n.id ? "text-primary" : "text-muted-foreground"}`}
                onClick={() => {
                  if (n.id === "casino") useCasino.setState({ activeGame: null });
                  setView(n.id);
                }}
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                {/* Saldo */}
                <button
                  type="button"
                  onClick={() => void useCasino.getState().refreshUser()}
                  title="Actualizar saldo"
                  className="gold-pulse flex items-center gap-2 rounded-full border border-gold/40 bg-gradient-to-b from-amber-400/15 to-amber-600/10 px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <Coins className="size-4 text-gold" aria-hidden />
                  <AnimatedNumber
                    value={user.balance}
                    format={fmtUSD}
                    className="text-sm font-bold text-gold"
                  />
                </button>

                {/* Usuario */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                      aria-label="Menú de usuario"
                    >
                      <Avatar className="size-8 border border-border">
                        <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold uppercase">
                          {user.username.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <User className="size-4" aria-hidden />
                      {user.username}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {user.balance < 1000 && (
                      <DropdownMenuItem onClick={() => void onReset()} disabled={resetting}>
                        <RotateCcw className="size-4" aria-hidden />
                        Recargar saldo demo
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        toast.info("Cerrando sesión…");
                        void logout();
                      }}
                    >
                      <LogOut className="size-4" aria-hidden />
                      Cerrar sesión
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        </div>

        {/* Navegación móvil */}
        <nav className="md:hidden flex items-center gap-1 pb-2" aria-label="Secciones móvil">
          {NAV.map((n) => (
            <Button
              key={n.id}
              variant={view === n.id ? "secondary" : "ghost"}
              size="sm"
              className={`flex-1 gap-1.5 h-9 ${view === n.id ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => {
                if (n.id === "casino") useCasino.setState({ activeGame: null });
                setView(n.id);
              }}
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}
