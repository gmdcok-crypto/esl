"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearStoredToken, getStoredToken } from "@/lib/client-api";

type Meeting = {
  id: string;
  roomId: string;
  meetingName: string;
  attendees: string[];
  organizerName: string;
  lastPushedAt?: string;
  lastPushStatus?: "success" | "failed";
  lastPushError?: string;
  updatedAt: string;
};

const emptyForm = {
  roomId: "1",
  meetingName: "",
  organizerName: "",
  attendees: "",
};

export function MeetingWorkspace() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(false);

  async function loadMeetings() {
    const data = await apiFetch<{ meetings: Meeting[] }>("/api/meetings");
    setMeetings(data.meetings);
  }

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login");
      return;
    }
    startTransition(async () => {
      try {
        await apiFetch("/api/auth/me");
        await loadMeetings();
        setReady(true);
      } catch {
        clearStoredToken();
        router.replace("/login");
      }
    });
  }, [router]);

  function fillForm(meeting: Meeting) {
    setEditingId(meeting.id);
    setForm({
      roomId: meeting.roomId,
      meetingName: meeting.meetingName,
      organizerName: meeting.organizerName,
      attendees: meeting.attendees.join(", "),
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const payload = {
          roomId: form.roomId.trim(),
          meetingName: form.meetingName.trim(),
          organizerName: form.organizerName.trim(),
          attendees: form.attendees,
        };
        if (editingId) {
          await apiFetch(`/api/meetings/${editingId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
          setMessage("회의 정보가 저장되었습니다.");
        } else {
          await apiFetch("/api/meetings", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          setMessage("회의가 등록되었습니다.");
        }
        resetForm();
        await loadMeetings();
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  async function onPush(id: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await apiFetch(`/api/meetings/${id}/push`, { method: "POST" });
        setMessage("전자명패로 전송 완료.");
        await loadMeetings();
      } catch (err) {
        setError(err instanceof Error ? err.message : "전송 실패");
        await loadMeetings();
      }
    });
  }

  async function onDelete(id: string) {
    if (!window.confirm("이 회의 정보를 삭제할까요?")) return;
    startTransition(async () => {
      await apiFetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (editingId === id) resetForm();
      await loadMeetings();
    });
  }

  function logout() {
    clearStoredToken();
    router.replace("/login");
  }

  if (!ready) {
    return <div className="workspace-loading">워크스페이스 준비 중…</div>;
  }

  return (
    <div className="workspace">
      <header className="workspace-top">
        <div>
          <p className="eyebrow">Operator Desk</p>
          <h1>회의 명패</h1>
        </div>
        <button type="button" className="btn-ghost" onClick={logout}>
          로그아웃
        </button>
      </header>

      <div className="workspace-grid">
        <section className="panel compose" aria-labelledby="compose-title">
          <h2 id="compose-title">{editingId ? "회의 수정" : "새 회의"}</h2>
          <p className="panel-lead">명패에 올릴 세 가지만 입력한 뒤 전송합니다.</p>

          <form className="compose-form" onSubmit={onSave}>
            <label>
              <span>Article / 룸 ID</span>
              <input
                value={form.roomId}
                onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value }))}
                required
                placeholder="예: 1"
              />
            </label>
            <label>
              <span>회의명</span>
              <input
                value={form.meetingName}
                onChange={(e) => setForm((f) => ({ ...f, meetingName: e.target.value }))}
                required
                placeholder="바이브코딩 심포지엄"
              />
            </label>
            <label>
              <span>주관기관</span>
              <input
                value={form.organizerName}
                onChange={(e) => setForm((f) => ({ ...f, organizerName: e.target.value }))}
                required
                placeholder="블루컴"
              />
            </label>
            <label>
              <span>참석자</span>
              <textarea
                value={form.attendees}
                onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
                required
                rows={3}
                placeholder="김혜란, 홍길동"
              />
            </label>

            <div className="compose-actions">
              <button className="btn-primary" type="submit" disabled={pending}>
                {editingId ? "저장" : "등록"}
              </button>
              {editingId ? (
                <button type="button" className="btn-ghost" onClick={resetForm}>
                  새로 작성
                </button>
              ) : null}
            </div>
          </form>

          {message ? <p className="form-ok">{message}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </section>

        <section className="panel board" aria-labelledby="board-title">
          <div className="board-head">
            <h2 id="board-title">등록된 회의</h2>
            <span className="count">{meetings.length}</span>
          </div>

          {meetings.length === 0 ? (
            <p className="empty">아직 등록된 회의가 없습니다.</p>
          ) : (
            <ul className="meeting-list">
              {meetings.map((meeting) => (
                <li key={meeting.id} className="meeting-item">
                  <div className="meeting-main">
                    <p className="meeting-name">{meeting.meetingName}</p>
                    <p className="meeting-meta">
                      <span>{meeting.organizerName}</span>
                      <span aria-hidden>·</span>
                      <span>룸 {meeting.roomId}</span>
                    </p>
                    <p className="meeting-people">{meeting.attendees.join(", ")}</p>
                    {meeting.lastPushStatus ? (
                      <p className={`push-status ${meeting.lastPushStatus}`}>
                        {meeting.lastPushStatus === "success" ? "전송됨" : "전송 실패"}
                        {meeting.lastPushedAt
                          ? ` · ${new Date(meeting.lastPushedAt).toLocaleString("ko-KR")}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="meeting-actions">
                    <button type="button" className="btn-primary" onClick={() => onPush(meeting.id)} disabled={pending}>
                      ESL 전송
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => fillForm(meeting)}>
                      수정
                    </button>
                    <button type="button" className="btn-ghost danger" onClick={() => onDelete(meeting.id)}>
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
