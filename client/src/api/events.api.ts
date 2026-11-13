import type { EventInput, EventRsvpStatus, ServerEventDTO } from "@discord-clone/shared";
import { http } from "./http";

export function fetchEvents() {
  return http.get<{ events: ServerEventDTO[] }>("/api/events").then((r) => r.data.events);
}

export function fetchEventArchive(serverId: string) {
  return http.get<{ events: ServerEventDTO[] }>("/api/events/archive", { params: { serverId } }).then((r) => r.data.events);
}

export function createEvent(serverId: string, body: EventInput) {
  return http.post<{ event: ServerEventDTO }>("/api/events", { ...body, serverId }).then((r) => r.data.event);
}

export function updateEvent(eventId: string, body: EventInput) {
  return http.patch<{ event: ServerEventDTO }>(`/api/events/${eventId}`, body).then((r) => r.data.event);
}

export function deleteEvent(eventId: string) {
  return http.delete(`/api/events/${eventId}`);
}

export function setRsvp(eventId: string, status: EventRsvpStatus | null) {
  return http.put<{ event: ServerEventDTO }>(`/api/events/${eventId}/rsvp`, { status }).then((r) => r.data.event);
}
