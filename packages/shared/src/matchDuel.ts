/**
 * ⚔️ Duels of the solo games: two people play their own boards at the same time; combos hurt the other.
 * Шмиксер ("match" channels): 2 minutes, higher score wins. Шметрис ("blocks" channels): last one
 * standing (cleared rows send garbage rows), at most BLOCKS_DUEL_SECONDS, then the higher score.
 */

/** How long a duel lasts. */
export const DUEL_SECONDS = 120;
export const BLOCKS_DUEL_SECONDS = 600;
/** Countdown before the boards open. */
export const DUEL_COUNTDOWN_MS = 3500;
/** How long an incoming attack is shown before it lands (a strong move of yours in that time blocks it). */
export const DUEL_WARN_MS = 1800;

/**
 * 🧊 ice: gems can't be moved · 🪨 stone: blocks in the top half · 🌫️ fog: the board is hidden for a few seconds
 * · 🌀 scramble: the colours are mixed.
 */
export type DuelAttackKind = "ice" | "stone" | "fog" | "scramble" | "garbage";
export const DUEL_ATTACKS: readonly DuelAttackKind[] = ["ice", "stone", "fog", "scramble", "garbage"];

export interface DuelPlayerDTO {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

/** Who waits for an opponent / who is playing in a match channel (sent to everyone who has it open). */
export interface DuelLobbyDTO {
  channelId: string;
  waiting: DuelPlayerDTO[];
  playing: {
    a: DuelPlayerDTO;
    b: DuelPlayerDTO;
    scoreA: number;
    scoreB: number;
    /** (2026-11-24+) for 👁 watching it */
    duelId?: string;
    spectators?: number;
  }[];
}

/** 👁 A duel as a spectator sees it: both players, scores and board pictures. */
export interface DuelSpectateDTO {
  duelId: string;
  channelId: string;
  a: DuelPlayerDTO;
  b: DuelPlayerDTO;
  scoreA: number;
  scoreB: number;
  boardA?: number[];
  boardB?: number[];
  startsAt: number;
  endsAt: number;
  serverNow: number;
}

export interface DuelSpectateUpdateDTO {
  duelId: string;
  userId: string;
  score: number;
  board?: number[];
  /** Шмиксер: the move's combo; Шметрис: lines cleared */
  combo?: number;
}

/** An attack sent / blocked (from = who did it). */
export interface DuelSpectateEventDTO {
  duelId: string;
  from: string;
  type: "attack" | "block";
  kind?: DuelAttackKind;
  power?: number;
}

export interface DuelSpectateOverDTO {
  duelId: string;
  winnerId: string | null;
  scoreA: number;
  scoreB: number;
  reason: DuelOverDTO["reason"];
}

export interface DuelStartDTO {
  channelId: string;
  duelId: string;
  opponent: DuelPlayerDTO;
  /** ms epoch (server clock) when the boards open / close */
  startsAt: number;
  endsAt: number;
  serverNow: number;
  /** back after a reconnect: the opponent's latest state */
  opponentScore?: number;
  opponentBoard?: number[];
  /** back after a reconnect: your own last score */
  yourScore?: number;
}

/** The opponent's score + a tiny picture of their board (see MatchBoard.codes()). */
export interface DuelOpponentDTO {
  duelId: string;
  score: number;
  board?: number[];
  combo?: number;
}

export interface DuelAttackDTO {
  duelId: string;
  kind: DuelAttackKind;
  /** 1..3 (Шметрис garbage: rows, 1..12) */
  power: number;
}

export interface DuelOverDTO {
  duelId: string;
  channelId: string;
  you: number;
  them: number;
  winnerId: string | null;
  /** out = topped out (Шметрис) */
  reason: "time" | "forfeit" | "left" | "out";
  /** your totals in this server */
  wins: number;
  games: number;
}
