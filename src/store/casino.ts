"use client";

import { create } from "zustand";
import { api } from "@/lib/client";

// ─────────────────────────────────────────────────────────────
// Store global del casino (zustand)
// ─────────────────────────────────────────────────────────────

export interface CasinoUser {
  id: string;
  username: string;
  balance: number;
  totalWagered: number;
  totalPayout: number;
  betsCount: number;
  winsCount: number;
  lossesCount: number;
  isBanned: boolean;
  createdAt: string;
}

export interface GameConfigPublic {
  game: string;
  name: string;
  enabled: boolean;
  minBet: number;
  maxBet: number;
  configJson: string;
  /** Techo de multiplier de la apuesta típica (informativo) */
  techo?: number;
}

export interface BetRecord {
  id: string;
  game: string;
  betType: string;
  amount: number;
  multiplier: number;
  payout: number;
  profit: number;
  outcome: string;
  resultJson: string;
  createdAt: string;
}

export type View = "casino" | "historial" | "ranking";

export interface PlayResponse {
  outcome: "win" | "lose" | "draw" | "void";
  multiplier: number;
  payout: number;
  profit: number;
  result: Record<string, unknown>;
  balance: number;
  reason?: string;
}

export interface TttMoveData {
  settled: boolean;
  balance: number;
  board: string[];
  aiMove?: number | null;
  outcome?: string;
  multiplier?: number;
  payout?: number;
  profit?: number;
  winLine?: number[] | null;
}

export type SessionPublicState = Record<string, unknown>;

export interface SessionStartData {
  betId: string;
  balance: number;
  state?: SessionPublicState;
  /** Blackjack: la mano puede liquidarse al repartir (naturals) */
  settled?: PlayResponse;
  serverNow?: number;
}

export interface SessionActData {
  settled: boolean;
  balance: number;
  outcome?: string;
  multiplier?: number;
  payout?: number;
  profit?: number;
  result?: Record<string, unknown>;
  state?: SessionPublicState;
  serverNow?: number;
  reason?: string;
}

const NEXT_PAGE = "/login";

interface CasinoState {
  hydrated: boolean;
  user: CasinoUser | null;
  /** La cuenta de la sesión actual está suspendida (403) */
  suspendido: boolean;
  view: View;
  activeGame: string | null;
  gamesConfig: GameConfigPublic[];
  bets: BetRecord[];
  /** ¿Está abierta la banca de la casa para pagar apuestas? */
  abierta: boolean;

  hydrate: () => Promise<void>;
  login: (
    username: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; isNew?: boolean; claimed?: boolean }>;
  logout: () => Promise<void>;
  setBalance: (balance: number) => void;
  refreshUser: () => Promise<void>;
  resetBalance: () => Promise<{ ok: boolean; error?: string }>;
  setView: (v: View) => void;
  setActiveGame: (g: string | null) => void;
  loadGames: () => Promise<void>;
  refreshBets: () => Promise<void>;

  play: (
    game: string,
    betType: string,
    amount: number,
    extra?: Record<string, unknown>,
  ) => Promise<{ ok: true; data: PlayResponse } | { ok: false; error: string }>;

  tttStart: (amount: number) => Promise<{ ok: true; data: { betId: string; balance: number } } | { ok: false; error: string }>;
  tttMove: (
    betId: string,
    cell: number,
  ) => Promise<{ ok: true; data: TttMoveData } | { ok: false; error: string }>;

  sessionStart: (
    game: string,
    amount: number,
    extra?: Record<string, unknown>,
  ) => Promise<{ ok: true; data: SessionStartData } | { ok: false; error: string }>;
  sessionAct: (
    game: string,
    betId: string,
    act: string,
    extra?: Record<string, unknown>,
  ) => Promise<{ ok: true; data: SessionActData } | { ok: false; error: string }>;
}

export const useCasino = create<CasinoState>((set, get) => ({
  hydrated: false,
  user: null,
  suspendido: false,
  view: "casino",
  activeGame: null,
  gamesConfig: [],
  bets: [],
  abierta: true,

  hydrate: async () => {
    // La sesión vive en una cookie httpOnly: el servidor es el que sabe
    const res = await api<{ user: CasinoUser }>("/api/auth/me");
    if (res.ok) {
      set({ user: res.data.user, suspendido: false, hydrated: true });
      void get().loadGames();
      void get().refreshBets();
      return;
    }
    set({ hydrated: true });
    if (res.status === 403) {
      // Cuenta suspendida: aviso en pantalla (sin bucle de redirecciones)
      set({ user: null, suspendido: true });
      return;
    }
    // Sin sesión (401) o error: al login — el proxy ya redirige, esto
    // cubre pestañas antiguas y sesiones expiradas
    if (typeof window !== "undefined") window.location.replace(NEXT_PAGE);
  },

  login: async (username, password) => {
    const res = await api<{ user: CasinoUser; isNew: boolean; claimed?: boolean }>(
      "/api/auth/login",
      { body: { username, password } },
    );
    if (!res.ok) return { ok: false, error: res.error };
    set({ user: res.data.user });
    void get().refreshBets();
    return { ok: true, isNew: res.data.isNew, claimed: res.data.claimed };
  },

  logout: async () => {
    try {
      await api("/api/auth/logout", { body: {} });
    } catch {
      // aunque falle la llamada, la sesión local se limpia igual
    }
    set({ user: null, bets: [], view: "casino", activeGame: null, suspendido: false });
    if (typeof window !== "undefined") window.location.replace(NEXT_PAGE);
  },

  setBalance: (balance) => {
    const u = get().user;
    if (u) set({ user: { ...u, balance } });
  },

  refreshUser: async () => {
    const res = await api<{ user: CasinoUser }>("/api/auth/me");
    if (res.ok) set({ user: res.data.user });
  },

  resetBalance: async () => {
    const u = get().user;
    if (!u) return { ok: false, error: "Sin sesión" };
    const res = await api<{ user: CasinoUser }>("/api/user/reset", { body: {} });
    if (!res.ok) return { ok: false, error: res.error };
    set({ user: res.data.user });
    return { ok: true };
  },

  setView: (view) => set({ view }),
  setActiveGame: (activeGame) => set({ activeGame }),

  loadGames: async () => {
    const res = await api<{ games: GameConfigPublic[]; abierta?: boolean }>("/api/games");
    if (res.ok) {
      set({ gamesConfig: res.data.games, abierta: res.data.abierta !== false });
    }
  },

  refreshBets: async () => {
    const res = await api<{ bets: BetRecord[] }>("/api/bets?limit=30");
    if (res.ok) set({ bets: res.data.bets });
  },

  play: async (game, betType, amount, extra) => {
    const u = get().user;
    if (!u) return { ok: false, error: "Inicia sesión para jugar" };
    // Endpoint propio por juego: POST /api/games/<juego>
    // El servidor identifica al jugador por la cookie de sesión
    const res = await api<PlayResponse>(`/api/games/${game}`, {
      body: { betType, amount, extra },
    });
    if (!res.ok) return { ok: false, error: res.error };
    set((s) => (s.user ? { user: { ...s.user, balance: res.data.balance } } : {}));
    void get().refreshBets();
    return { ok: true, data: res.data };
  },

  tttStart: async (amount) => {
    const u = get().user;
    if (!u) return { ok: false, error: "Inicia sesión para jugar" };
    const res = await api<{ betId: string; balance: number }>("/api/games/tictactoe", {
      body: { action: "start", amount },
    });
    if (!res.ok) return { ok: false, error: res.error };
    get().setBalance(res.data.balance);
    return { ok: true, data: { betId: res.data.betId, balance: res.data.balance } };
  },

  tttMove: async (betId, cell) => {
    const u = get().user;
    if (!u) return { ok: false, error: "Sin sesión" };
    const res = await api<TttMoveData>("/api/games/tictactoe", {
      body: { action: "move", betId, cell },
    });
    if (!res.ok) return { ok: false, error: res.error };
    get().setBalance(res.data.balance);
    if (res.data.settled) void get().refreshBets();
    return { ok: true, data: res.data };
  },

  sessionStart: async (game, amount, extra) => {
    const u = get().user;
    if (!u) return { ok: false, error: "Inicia sesión para jugar" };
    const res = await api<SessionStartData>(`/api/games/${game}`, {
      body: { action: "start", amount, extra },
    });
    if (!res.ok) return { ok: false, error: res.error };
    get().setBalance(res.data.balance);
    return { ok: true, data: res.data };
  },

  sessionAct: async (game, betId, act, extra) => {
    const u = get().user;
    if (!u) return { ok: false, error: "Sin sesión" };
    const res = await api<SessionActData>(`/api/games/${game}`, {
      body: { action: "act", betId, act, extra },
    });
    if (!res.ok) return { ok: false, error: res.error };
    get().setBalance(res.data.balance);
    if (res.data.settled) void get().refreshBets();
    return { ok: true, data: res.data };
  },
}));
