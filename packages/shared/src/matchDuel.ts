/** ⚔️ Шмиксер duel: two people play their own boards at the same time; combos send attacks. */

/** How long a duel lasts. */
export const DUEL_SECONDS = 120;
/** Countdown before the boards open. */
export const DUEL_COUNTDOWN_MS = 3500;
/** How long an incoming attack is shown before it lands (a strong move of yours in that time blocks it). */
export const DUEL_WARN_MS = 1800;

/**
 * 🧊 ice: gems can't be moved · 🪨 stone: blocks in the top half · 🌫️ fog: the board is hidden for a few seconds
 * · 🌀 scramble: the colours are mixed.
 */
export type DuelAttackKind = "ice" | "stone" | "fog" | "scramble";
export const DUEL_ATTACKS: readonly DuelAttackKind[] = ["ice", "stone", "fog", "scramble"];

export interface DuelPlayerDTO {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

/** Who waits for an opponent / who is playing in a match channel (sent to everyone who has it open). */
export interface DuelLobbyDTO {
  channelId: string;
  waiting: DuelPlayerDTO[];
  playing: { a: DuelPlayerDTO; b: DuelPlayerDTO; scoreA: number; scoreB: number }[];
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
  /** 1..3 */
  power: number;
}

export interface DuelOverDTO {
  duelId: string;
  channelId: string;
  you: number;
  them: number;
  winnerId: string | null;
  reason: "time" | "forfeit" | "left";
  /** your totals in this server */
  wins: number;
  games: number;
}
