/** 🎨 "Рисувай и познай" — shared shapes between the server game and the client view. */

/** The picture is drawn on a fixed 800×600 canvas (scaled to fit on screen). */
export const DRAW_W = 800;
export const DRAW_H = 600;

/**
 * One drawing operation. `id` groups the pieces of one stroke (a long stroke is sent in several
 * chunks) so undo removes the whole stroke.
 * - line: points as a flat list x0,y0,x1,y1,… (canvas pixels); colour "#rrggbb"; width in pixels
 * - fill: flood fill from x,y
 */
export type DrawOp =
  | { t: "line"; id: number; c: string; w: number; p: number[] }
  | { t: "fill"; id: number; c: string; x: number; y: number };

export interface DrawPlayerDTO {
  userId: string;
  username: string;
  avatarUrl: string | null;
  score: number;
  /** Guessed the word this turn. */
  guessed: boolean;
  /** Points won in the turn that just ended (shown on the reveal screen). */
  lastGain: number;
  /** Closed the game / left the channel. */
  away: boolean;
}

export type DrawPhase = "lobby" | "choosing" | "drawing" | "reveal" | "over";

export interface DrawStateDTO {
  channelId: string;
  phase: DrawPhase;
  players: DrawPlayerDTO[];
  drawerId: string | null;
  round: number;
  rounds: number;
  /** Seconds to draw (setting). */
  seconds: number;
  /** When the current phase ends (ms epoch), null in lobby/over. */
  endsAt: number | null;
  /** "_ _ а _" for guessers, the word itself for the drawer / those who guessed / the reveal. */
  word: string;
  /** Letter count per word, e.g. [5] or [4, 6]. */
  wordLengths: number[];
  /** Only for the drawer while choosing. */
  choices: string[] | null;
  /** Whether *you* are allowed to see the real word right now. */
  youKnow: boolean;
  /** Server clock when this was sent (to count endsAt down without clock skew). */
  serverNow: number;
}

export interface DrawChatLine {
  id: string;
  channelId: string;
  kind: "guess" | "system" | "correct" | "close";
  userId?: string;
  username?: string;
  text: string;
}

export interface DrawTopRow {
  username: string;
  points: number;
  wins: number;
  games: number;
}
