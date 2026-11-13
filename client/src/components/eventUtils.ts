import { eventEndMs, type ServerEventDTO } from "@discord-clone/shared";
import { useEffect, useState } from "react";
import { getAppPrefs } from "../utils/appPrefs";

/** Re-renders every `ms` (countdowns). */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function fmtTime(iso: string | number) {
  return new Date(iso).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit", hour12: !getAppPrefs().clock24h });
}

export function fmtDay(iso: string | number) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 24 * 3600_000);
  if (d.toDateString() === today.toDateString()) return "Днес";
  if (d.toDateString() === tomorrow.toDateString()) return "Утре";
  return d.toLocaleDateString("bg-BG", { weekday: "short", day: "numeric", month: "long" });
}

export function fmtRange(e: ServerEventDTO) {
  const start = fmtTime(e.startsAt);
  return e.endsAt ? `${start} – ${fmtTime(e.endsAt)}` : start;
}

export const RECURRENCE_LABEL: Record<string, string> = {
  none: "",
  daily: "🔁 всеки ден",
  weekly: "🔁 всяка седмица",
};

/** yyyy-mm-dd / HH:mm in local time, for <input type="date|time">. */
export function toDateInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function toTimeInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------- calendar export

function icsStamp(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const RRULE: Record<string, string> = { daily: "RRULE:FREQ=DAILY", weekly: "RRULE:FREQ=WEEKLY" };

export function downloadIcs(e: ServerEventDTO, place: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ShmirkaTa//Events//BG",
    "BEGIN:VEVENT",
    `UID:${e.id}@shmirka`,
    `DTSTAMP:${icsStamp(Date.now())}`,
    `DTSTART:${icsStamp(Date.parse(e.startsAt))}`,
    `DTEND:${icsStamp(eventEndMs(e))}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(place ? [`LOCATION:${icsEscape(place)}`] : []),
    ...(RRULE[e.recurrence] ? [RRULE[e.recurrence]] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(e.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${e.title.replace(/[\\/:*?"<>|]+/g, "").slice(0, 60) || "event"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function googleCalendarUrl(e: ServerEventDTO, place: string) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsStamp(Date.parse(e.startsAt))}/${icsStamp(eventEndMs(e))}`,
    details: e.description,
    location: place,
  });
  if (RRULE[e.recurrence]) params.set("recur", RRULE[e.recurrence]);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
