import { SocketEvents, type PollDTO } from "@discord-clone/shared";
import { useState } from "react";
import { createPortal } from "react-dom";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useMembersStore } from "../store/membersStore";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useNow } from "./eventUtils";
import { tr } from "../i18n";

function timeLeft(endsAt: string, now: number): string {
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) return tr("приключи", "closed");
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return tr(`още ${m} мин`, `${m} min left`);
  const h = Math.round(m / 60);
  if (h < 48) return tr(`още ${h} ч`, `${h} h left`);
  return tr(`още ${Math.round(h / 24)} дни`, `${Math.round(h / 24)} days left`);
}

/** 📊 A poll in the chat: click an option to vote (again to take it back). */
export function PollCard({ poll, authorId }: { poll: PollDTO; authorId: string }) {
  const me = useAuthStore((s) => s.user?.id);
  const members = useMembersStore((s) => s.members);
  const now = useNow(30_000);
  const closed = !!poll.endsAt && Date.parse(poll.endsAt) <= now;
  const voters = new Set(poll.votes.flat());
  const total = poll.votes.reduce((n, v) => n + v.length, 0);
  const max = Math.max(0, ...poll.votes.map((v) => v.length));
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.username ?? "?";
  const voted = !!me && voters.has(me);
  const showResults = voted || closed;

  function vote(i: number) {
    if (closed) return;
    getSocket()?.emit(SocketEvents.PollVote, { pollId: poll.id, option: i });
  }

  return (
    <div className={`poll-card ${closed ? "closed" : ""}`}>
      <div className="poll-question">📊 {poll.question}</div>
      <div className="poll-sub">
        {poll.multi ? tr("Може повече от един отговор", "Pick as many as you like") : tr("Избери един отговор", "Pick one")}
        {poll.endsAt && ` · ${timeLeft(poll.endsAt, now)}`}
      </div>
      <div className="poll-options">
        {poll.options.map((opt, i) => {
          const n = poll.votes[i]?.length ?? 0;
          const mine = !!me && (poll.votes[i] ?? []).includes(me);
          const pct = total ? Math.round((n / total) * 100) : 0;
          const winner = closed && n > 0 && n === max;
          return (
            <button
              key={i}
              className={`poll-option ${mine ? "mine" : ""} ${winner ? "winner" : ""}`}
              disabled={closed}
              onClick={() => vote(i)}
              title={n ? (poll.votes[i] ?? []).map(nameOf).join(", ") : undefined}
            >
              {showResults && <span className="poll-bar" style={{ width: `${pct}%` }} />}
              <span className="poll-check">{mine ? "✔" : poll.multi ? "☐" : "○"}</span>
              <span className="poll-option-text">{opt}</span>
              {showResults && (
                <span className="poll-count">
                  {n} · {pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="poll-footer">
        {voters.size} {voters.size === 1 ? tr("гласувал", "voter") : tr("гласували", "voters")}
        {!showResults && ` · ${tr("гласувай, за да видиш резултатите", "vote to see the results")}`}
        {!closed && me === authorId && (
          <button className="poll-end" onClick={() => getSocket()?.emit(SocketEvents.PollVote, { pollId: poll.id, close: true })}>
            {tr("Приключи анкетата", "End poll")}
          </button>
        )}
      </div>
    </div>
  );
}

/** "Нова анкета" dialog. */
export function PollCreateModal({ textChannelId, onClose }: { textChannelId: string; onClose: () => void }) {
  useEscapeKey(onClose);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [hours, setHours] = useState(24);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ok = question.trim() && filled.length >= 2;

  function create() {
    if (!ok) return;
    getSocket()?.emit(SocketEvents.PollCreate, { textChannelId, question: question.trim(), options: filled, multi, hours });
    onClose();
  }

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card poll-create">
        <h3>📊 {tr("Нова анкета", "New poll")}</h3>
        <label className="poll-create-label">{tr("Въпрос", "Question")}</label>
        <input
          className="poll-create-input"
          autoFocus
          maxLength={300}
          value={question}
          placeholder={tr("напр. Кога играем довечера?", "e.g. When do we play tonight?")}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <label className="poll-create-label">{tr("Отговори", "Answers")}</label>
        {options.map((o, i) => (
          <div key={i} className="poll-create-option">
            <input
              className="poll-create-input"
              maxLength={80}
              value={o}
              placeholder={`${tr("Отговор", "Answer")} ${i + 1}`}
              onChange={(e) => setOptions((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && i === options.length - 1 && options.length < 10) setOptions((l) => [...l, ""]);
              }}
            />
            {options.length > 2 && (
              <button type="button" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))} title={tr("Махни", "Remove")}>
                ✕
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button type="button" className="poll-create-add" onClick={() => setOptions((l) => [...l, ""])}>
            + {tr("Добави отговор", "Add answer")}
          </button>
        )}
        <label className="poll-create-check">
          <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
          {tr("Може повече от един отговор", "Allow several answers")}
        </label>
        <label className="poll-create-row">
          {tr("Продължава", "Runs for")}
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={1}>{tr("1 час", "1 hour")}</option>
            <option value={4}>{tr("4 часа", "4 hours")}</option>
            <option value={24}>{tr("1 ден", "1 day")}</option>
            <option value={72}>{tr("3 дни", "3 days")}</option>
            <option value={168}>{tr("1 седмица", "1 week")}</option>
            <option value={0}>{tr("без край", "no end")}</option>
          </select>
        </label>
        <div className="poll-create-actions">
          <button type="button" onClick={onClose}>
            {tr("Отказ", "Cancel")}
          </button>
          <button type="button" className="primary" disabled={!ok} onClick={create}>
            {tr("Пусни анкетата", "Post poll")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
