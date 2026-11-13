import { splitAttendees } from "@discord-clone/shared";
import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { countdown, isRunning, isToday, todaysEvent, upcomingOf, useEventsStore } from "../store/eventsStore";
import { useServerStore } from "../store/serverStore";
import { fmtTime, useNow } from "./eventUtils";
import "./events.css";

const COLLAPSE_KEY = "eventsSectionCollapsed";

/** "📅 Събития" above the text channels: only today's events (banner + the rest); everything else is under "Всички". */
export default function EventsSection() {
  const activeServerId = useServerStore((s) => s.activeServerId);
  const events = useEventsStore((s) => s.events);
  const seenAt = useEventsStore((s) => s.seenAt);
  const openBoard = useEventsStore((s) => s.openBoard);
  const me = useAuthStore((s) => s.user?.id);
  const now = useNow();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "true");

  const upcoming = upcomingOf(events, activeServerId, now);
  const today = todaysEvent(upcoming, now);
  // Only today's events are listed here (the banner one too); later ones are under "Всички".
  const todayRest = upcoming.filter((e) => isToday(e, now) || isRunning(e, now));
  const seen = activeServerId ? (seenAt[activeServerId] ?? 0) : 0;
  const isNew = (createdAt: string, creatorId: string) => creatorId !== me && Date.parse(createdAt) > seen;
  const newCount = upcoming.filter((e) => isNew(e.createdAt, e.creatorId)).length;

  function toggle() {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, String(!c));
      return !c;
    });
  }

  return (
    <div className="ev-section">
      <div className="channel-section ev-section-head">
        <button className="ev-section-toggle" onClick={toggle} title={collapsed ? "Покажи" : "Скрий"}>
          <span className="ev-caret">{collapsed ? "▸" : "▾"}</span> Събития
        </button>
        {newCount > 0 && <span className="ev-new-badge">{newCount} ново</span>}
        <span className="ev-spacer" />
        <button className="ev-section-btn" onClick={() => openBoard()} title="Всички събития">
          Всички
        </button>
        <button className="ev-section-btn plus" onClick={() => openBoard({ creating: true })} title="Ново събитие">
          ＋
        </button>
      </div>

      {today && (
        <button className={`ev-today ${isRunning(today, now) ? "live" : ""}`} onClick={() => openBoard({ eventId: today.id })}>
          <span className="ev-today-tag">{isRunning(today, now) ? "🔴 ЗАПОЧНА" : "🔥 ДНЕС"}</span>
          <span className="ev-today-title">{today.title}</span>
          <span className="ev-today-meta">
            {isRunning(today, now) ? "тече сега" : `в ${fmtTime(today.startsAt)}`} · ✅ {splitAttendees(today).going.length}
          </span>
        </button>
      )}

      {!collapsed && (
        <div className="ev-mini-list">
          {upcoming.length === 0 && (
            <button className="ev-mini-empty" onClick={() => openBoard({ creating: true })}>
              Няма събития — ＋ създай
            </button>
          )}
          {upcoming.length > 0 && todayRest.length === 0 && (
            <button className="ev-mini-empty" onClick={() => openBoard()}>
              Днес няма събития · виж всички →
            </button>
          )}
          {todayRest.map((e) => {
            const mine = e.rsvps.find((r) => r.userId === me)?.status;
            return (
              <button key={e.id} className="ev-mini" onClick={() => openBoard({ eventId: e.id })}>
                <span className="ev-mini-thumb" style={e.imageUrl ? { backgroundImage: `url("${e.imageUrl}")` } : undefined}>
                  {!e.imageUrl && new Date(e.startsAt).getDate()}
                </span>
                <span className="ev-mini-text">
                  <span className="ev-mini-title">
                    {isNew(e.createdAt, e.creatorId) && <span className="ev-dot" title="Ново" />}
                    {e.title}
                  </span>
                  <span className="ev-mini-meta">
                    {fmtTime(e.startsAt)} · {countdown(e, now)}
                  </span>
                </span>
                <span className={`ev-mini-count ${mine ?? ""}`} title={mine === "going" ? "Записан си" : undefined}>
                  ✅{splitAttendees(e).going.length}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
