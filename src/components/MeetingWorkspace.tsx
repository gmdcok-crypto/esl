"use client";

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, clearStoredToken, getStoredToken } from "@/lib/client-api";

type SeatAssignment = {
  labelCode: string;
  articleId: string;
  attendeeName: string;
};

type Meeting = {
  id: string;
  meetingName: string;
  attendees: string[];
  organizerName: string;
  seats: SeatAssignment[];
  lastPushedAt?: string;
  lastPushStatus?: "success" | "failed";
  lastPushError?: string;
  updatedAt: string;
};

type SeatLabel = {
  labelCode: string;
  articleId: string;
  articleName?: string;
  online: boolean;
  battery?: string;
  gatewayName?: string;
  type?: string;
};

const emptyForm = {
  meetingName: "",
  organizerName: "",
  attendees: "",
};

export function MeetingWorkspace() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [labels, setLabels] = useState<SeatLabel[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [seatPick, setSeatPick] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(false);

  const activeMeeting = useMemo(
    () => meetings.find((m) => m.id === activeId) ?? null,
    [meetings, activeId],
  );

  const attendeeOptions = activeMeeting?.attendees ?? [];

  async function loadAll() {
    try {
      const meetingData = await apiFetch<{ meetings: Meeting[] }>("/api/meetings");
      setMeetings(meetingData.meetings);
      if (!activeId && meetingData.meetings[0]) {
        setActiveId(meetingData.meetings[0].id);
      }
    } catch (err) {
      setMeetings([]);
      setError(err instanceof Error ? err.message : "회의 목록을 불러오지 못했습니다.");
    }

    try {
      const labelData = await apiFetch<{ labels: SeatLabel[]; count?: number; error?: string }>(
        "/api/labels",
      );
      setLabels(labelData.labels ?? []);
      if (labelData.error) {
        setError(labelData.error);
      }
    } catch (err) {
      setLabels([]);
      setError(err instanceof Error ? err.message : "명패 목록을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    if (!getStoredToken()) {
      router.replace("/login");
      return;
    }
    startTransition(async () => {
      try {
        await apiFetch("/api/auth/me");
      } catch {
        clearStoredToken();
        router.replace("/login");
        return;
      }

      await loadAll();
      setReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (!activeMeeting) {
      setSeatPick({});
      return;
    }
    const next: Record<string, string> = {};
    for (const seat of activeMeeting.seats) {
      next[seat.labelCode] = seat.attendeeName;
    }
    setSeatPick(next);
    setForm({
      meetingName: activeMeeting.meetingName,
      organizerName: activeMeeting.organizerName,
      attendees: activeMeeting.attendees.join(", "),
    });
  }, [activeMeeting]);

  function resetForm() {
    setActiveId(null);
    setForm(emptyForm);
    setSeatPick({});
  }

  async function onSaveMeeting(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const payload = {
          meetingName: form.meetingName.trim(),
          organizerName: form.organizerName.trim(),
          attendees: form.attendees,
        };
        if (activeId) {
          await apiFetch(`/api/meetings/${activeId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
          setMessage("회의 정보가 저장되었습니다.");
        } else {
          const created = await apiFetch<{ meeting: Meeting }>("/api/meetings", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          setActiveId(created.meeting.id);
          setMessage("회의가 등록되었습니다. 명패에 참석자를 배정하세요.");
        }
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "저장 실패");
      }
    });
  }

  async function persistSeats(): Promise<number> {
    if (!activeId) {
      throw new Error("먼저 회의를 저장하세요.");
    }
    const seats: SeatAssignment[] = labels
      .filter((label) => seatPick[label.labelCode] && label.articleId)
      .map((label) => ({
        labelCode: label.labelCode,
        articleId: label.articleId,
        attendeeName: seatPick[label.labelCode],
      }));

    await apiFetch(`/api/meetings/${activeId}`, {
      method: "PUT",
      body: JSON.stringify({ seats }),
    });
    return seats.length;
  }

  async function onSaveSeats() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const count = await persistSeats();
        setMessage(`좌석 배정 ${count}건 저장.`);
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "배정 저장 실패");
      }
    });
  }

  async function onPush() {
    if (!activeId) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await persistSeats();
        const result = await apiFetch<{ pushed: number }>(`/api/meetings/${activeId}/push`, {
          method: "POST",
        });
        setMessage(`전자명패 ${result.pushed}장 전송 완료.`);
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "전송 실패");
        await loadAll();
      }
    });
  }

  async function onDelete(id: string) {
    if (!window.confirm("이 회의를 삭제할까요?")) return;
    startTransition(async () => {
      await apiFetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (activeId === id) resetForm();
      await loadAll();
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
          <p className="eyebrow">Seat Nameplates</p>
          <h1>좌석 명패 배정</h1>
        </div>
        <button type="button" className="btn-ghost" onClick={logout}>
          로그아웃
        </button>
      </header>

      <div className="workspace-grid seat-layout">
        <section className="panel compose" aria-labelledby="compose-title">
          <h2 id="compose-title">{activeId ? "회의 정보" : "새 회의"}</h2>
          <p className="panel-lead">회의명·주관기관·참석자 명단을 만든 뒤, 오른쪽에서 명패에 배정합니다.</p>

          <form className="compose-form" onSubmit={onSaveMeeting}>
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
              <span>참석자 명단 (콤보용)</span>
              <textarea
                value={form.attendees}
                onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
                required
                rows={4}
                placeholder="김혜란, 홍길동, 이영희"
              />
            </label>

            <div className="compose-actions">
              <button className="btn-primary" type="submit" disabled={pending}>
                회의 저장
              </button>
              <button type="button" className="btn-ghost" onClick={resetForm}>
                새 회의
              </button>
            </div>
          </form>

          <div className="meeting-switch">
            <p className="switch-label">저장된 회의</p>
            <ul className="meeting-mini-list">
              {meetings.map((meeting) => (
                <li key={meeting.id}>
                  <button
                    type="button"
                    className={`meeting-chip ${activeId === meeting.id ? "active" : ""}`}
                    onClick={() => setActiveId(meeting.id)}
                  >
                    {meeting.meetingName}
                  </button>
                  <button type="button" className="btn-ghost danger tiny" onClick={() => onDelete(meeting.id)}>
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {message ? <p className="form-ok">{message}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </section>

        <section className="panel board" aria-labelledby="board-title">
          <div className="board-head">
            <div>
              <h2 id="board-title">등록된 명패</h2>
              <p className="panel-lead tight">명패마다 참석자를 콤보에서 선택합니다.</p>
            </div>
            <span className="count">{labels.length}</span>
          </div>

          {!activeMeeting ? (
            <p className="empty">왼쪽에서 회의를 먼저 저장하세요.</p>
          ) : labels.length === 0 ? (
            <p className="empty">AIMS에 등록된 명패가 없습니다.</p>
          ) : (
            <ul className="seat-list">
              {labels.map((label) => (
                <li key={label.labelCode} className="seat-row">
                  <div className="seat-info">
                    <p className="seat-code">{label.labelCode}</p>
                    <p className="seat-meta">
                      <span className={label.online ? "dot on" : "dot off"} />
                      {label.online ? "Online" : "Offline"}
                      {label.articleId ? ` · Article ${label.articleId}` : " · Article 없음"}
                      {label.battery ? ` · ${label.battery}` : ""}
                    </p>
                    {label.articleName ? <p className="seat-article">{label.articleName}</p> : null}
                  </div>

                  <label className="seat-combo">
                    <span>참석자</span>
                    <select
                      value={seatPick[label.labelCode] ?? ""}
                      disabled={!label.articleId || attendeeOptions.length === 0}
                      onChange={(e) =>
                        setSeatPick((prev) => ({ ...prev, [label.labelCode]: e.target.value }))
                      }
                    >
                      <option value="">선택</option>
                      {attendeeOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="compose-actions seat-actions">
            <button type="button" className="btn-ghost" onClick={() => startTransition(() => loadAll())} disabled={pending}>
              명패 새로고침
            </button>
            <button type="button" className="btn-ghost" onClick={onSaveSeats} disabled={pending || !activeId}>
              배정 저장
            </button>
            <button type="button" className="btn-primary" onClick={onPush} disabled={pending || !activeId}>
              ESL 일괄 전송
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
