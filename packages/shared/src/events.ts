/** Server events ("📅 Събития" board above the text channels). */

export type EventRsvpStatus = "going" | "maybe" | "no";
export type EventRecurrence = "none" | "daily" | "weekly";

export interface EventRsvpDTO {
  userId: string;
  username: string;
  avatarUrl: string | null;
  status: EventRsvpStatus;
  /** When this status was picked — "going" order decides who is in and who is a reserve. */
  at: string;
}

export interface ServerEventDTO {
  id: string;
  serverId: string;
  title: string;
  description: string;
  startsAt: string;
  /** null = no set end (counts as 2 hours long). */
  endsAt: string | null;
  imageUrl: string | null;
  /** A voice channel of the server (gives a "Join" button), or null. */
  voiceChannelId: string | null;
  /** Free-text place, used when there is no voice channel. */
  location: string | null;
  /** null = no limit; beyond it "going" people are reserves. */
  maxAttendees: number | null;
  recurrence: EventRecurrence;
  creatorId: string;
  creatorUsername: string;
  createdAt: string;
  rsvps: EventRsvpDTO[];
}

export interface EventInput {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string | null;
  imageUrl?: string | null;
  voiceChannelId?: string | null;
  location?: string | null;
  maxAttendees?: number | null;
  recurrence?: EventRecurrence;
}

/** Sent to every member when an event of their server is created (for the "new event" toast). */
export interface EventCreatedPayload {
  serverId: string;
  eventId: string;
  title: string;
  startsAt: string;
  creatorId: string;
  creatorUsername: string;
}

export const EVENT_DEFAULT_LENGTH_MS = 2 * 60 * 60 * 1000;
/** Ended events stay on the board this long before they move to the archive. */
export const EVENT_ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000;

export function eventEndMs(e: { startsAt: string; endsAt: string | null }): number {
  return e.endsAt ? new Date(e.endsAt).getTime() : new Date(e.startsAt).getTime() + EVENT_DEFAULT_LENGTH_MS;
}

/** "going" people in sign-up order, split by the limit. */
export function splitAttendees(e: ServerEventDTO): { going: EventRsvpDTO[]; reserves: EventRsvpDTO[]; maybe: EventRsvpDTO[] } {
  const going = e.rsvps.filter((r) => r.status === "going").sort((a, b) => a.at.localeCompare(b.at));
  const maybe = e.rsvps.filter((r) => r.status === "maybe");
  if (e.maxAttendees == null) return { going, reserves: [], maybe };
  return { going: going.slice(0, e.maxAttendees), reserves: going.slice(e.maxAttendees), maybe };
}
