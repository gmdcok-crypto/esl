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

type MainTab = "meeting" | "assign";

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
  const [tab, setTab] = useState<MainTab>("assign");

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

  async function saveMeeting() {
    setError(null);
    setMessage(null);
    const payload = {
      meetingName: form.meetingName.trim(),
      organizerName: form.organizerName.trim(),
      attendees: form.attendees,
    };
    if (!payload.meetingName || !payload.organizerName || !payload.attendees.trim()) {
      throw new Error("회의명, 주관기관, 참석자명단을 입력하세요.");
    }
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
      setTab("assign");
    }
    await loadAll();
  }

  async function onSaveMeeting(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await saveMeeting();
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
    <div className="aims-shell">
      <aside className="aims-sidebar" aria-label="주 메뉴">
        <div className="aims-logo">명패 SaaS</div>
        <nav className="aims-menu">
          <div className="aims-menu-group">
            <div className="aims-menu-title">
              Label
              <span className="chev">▾</span>
            </div>
            <ul className="aims-submenu">
              <li>
                <button
                  type="button"
                  className={`aims-menu-item ${tab === "meeting" ? "active" : ""}`}
                  onClick={() => setTab("meeting")}
                >
                  회의 설정
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`aims-menu-item ${tab === "assign" ? "active" : ""}`}
                  onClick={() => setTab("assign")}
                >
                  명패 배정
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      <div className="aims-main">
        <header className="aims-topbar">
          <div className="aims-store-search" aria-hidden>
            <span>⌕</span>
            <span>매장을 선택하세요</span>
          </div>
          <p className="aims-store-path">BLU · 전자명패 운영</p>
          <div className="aims-top-actions">
            <span style={{ color: "var(--muted)", fontSize: "0.84rem" }}>한국어</span>
            <button type="button" className="btn-ghost tiny" onClick={logout}>
              로그아웃
            </button>
            <span className="aims-avatar" aria-hidden>
              M
            </span>
          </div>
        </header>

        <div className="aims-content">
          <h1 className="aims-page-title">
            <span aria-hidden>▦</span>
            Seat Nameplates
          </h1>

          <div className="aims-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "assign"}
              className={`aims-tab ${tab === "assign" ? "active" : ""}`}
              onClick={() => setTab("assign")}
            >
              LABEL ASSIGN
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "meeting"}
              className={`aims-tab ${tab === "meeting" ? "active" : ""}`}
              onClick={() => setTab("meeting")}
            >
              MEETING SETUP
            </button>
          </div>

          <div className="aims-panel">
            {message || error ? (
              <div className="flash-row">
                {message ? <p className="form-ok">{message}</p> : null}
                {error ? <p className="form-error">{error}</p> : null}
              </div>
            ) : null}

            {tab === "meeting" ? (
              <>
                <div className="aims-filter">
                  <label className="aims-field">
                    <span>회의명</span>
                    <input
                      value={form.meetingName}
                      onChange={(e) => setForm((f) => ({ ...f, meetingName: e.target.value }))}
                      placeholder="바이브코딩 심포지엄"
                    />
                  </label>
                  <label className="aims-field">
                    <span>주관기관</span>
                    <input
                      value={form.organizerName}
                      onChange={(e) => setForm((f) => ({ ...f, organizerName: e.target.value }))}
                      placeholder="블루컴"
                    />
                  </label>
                  <div className="aims-filter-actions">
                    <button
                      type="button"
                      className="btn-navy"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await saveMeeting();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "저장 실패");
                          }
                        })
                      }
                    >
                      저장
                    </button>
                    <button type="button" className="btn-navy" onClick={resetForm}>
                      Clear
                    </button>
                  </div>
                </div>

                <form className="compose-form" onSubmit={onSaveMeeting}>
                  <label>
                    <span>참석자명단 (쉼표로 구분)</span>
                    <textarea
                      value={form.attendees}
                      onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
                      required
                      rows={4}
                      placeholder="김혜란, 홍길동, 이영희"
                    />
                  </label>
                  <div className="aims-actions">
                    <button className="btn-navy" type="submit" disabled={pending}>
                      회의 저장
                    </button>
                    <button type="button" className="btn-ghost" onClick={resetForm}>
                      새 회의
                    </button>
                  </div>
                </form>

                <div style={{ marginTop: "1.25rem" }}>
                  <p className="switch-label" style={{ margin: "0 0 0.55rem", color: "var(--muted)", fontSize: "0.82rem", fontWeight: 700 }}>
                    저장된 회의
                  </p>
                  {meetings.length === 0 ? (
                    <p className="aims-empty-banner">사용 가능한 데이터 없음</p>
                  ) : (
                    <ul className="meeting-mini-list">
                      {meetings.map((meeting) => (
                        <li key={meeting.id}>
                          <button
                            type="button"
                            className={`meeting-chip ${activeId === meeting.id ? "active" : ""}`}
                            onClick={() => {
                              setActiveId(meeting.id);
                              setTab("assign");
                            }}
                          >
                            {meeting.meetingName}
                            {meeting.lastPushStatus ? ` · ${meeting.lastPushStatus}` : ""}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost danger tiny"
                            onClick={() => onDelete(meeting.id)}
                          >
                            삭제
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="aims-filter">
                  <label className="aims-field">
                    <span>선택 회의</span>
                    <select
                      value={activeId ?? ""}
                      onChange={(e) => setActiveId(e.target.value || null)}
                    >
                      <option value="">회의 선택</option>
                      {meetings.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.meetingName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="aims-field">
                    <span>명패 수</span>
                    <input value={`${labels.length}개`} readOnly />
                  </label>
                  <div className="aims-filter-actions">
                    <button
                      type="button"
                      className="btn-navy"
                      disabled={pending}
                      onClick={() => startTransition(() => loadAll())}
                    >
                      찾기
                    </button>
                    <button
                      type="button"
                      className="btn-navy"
                      disabled={pending}
                      onClick={() => startTransition(() => loadAll())}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {!activeMeeting ? (
                  <p className="aims-empty-banner">회의를 먼저 선택하거나 MEETING SETUP에서 저장하세요.</p>
                ) : labels.length === 0 ? (
                  <p className="aims-empty-banner">사용 가능한 데이터 없음</p>
                ) : (
                  <div className="aims-table-wrap">
                    <table className="aims-table" aria-label="등록된 명패 목록">
                      <thead>
                        <tr>
                          <th style={{ width: "3rem" }}>#</th>
                          <th>LABEL CODE</th>
                          <th>STATUS</th>
                          <th>ARTICLE</th>
                          <th>참석자</th>
                        </tr>
                      </thead>
                      <tbody>
                        {labels.map((label, index) => (
                          <tr key={label.labelCode}>
                            <td>{index + 1}</td>
                            <td>
                              <p className="seat-code">{label.labelCode}</p>
                              {label.type ? <p className="seat-meta">{label.type}</p> : null}
                            </td>
                            <td>
                              <span className={label.online ? "dot on" : "dot off"} />
                              {label.online ? "Online" : "Offline"}
                              {label.battery ? ` · ${label.battery}` : ""}
                            </td>
                            <td>
                              {label.articleId ? (
                                <>
                                  <div>{label.articleId}</div>
                                  {label.articleName ? (
                                    <p className="seat-article">{label.articleName}</p>
                                  ) : null}
                                </>
                              ) : (
                                <span style={{ color: "var(--danger)" }}>Article 없음</span>
                              )}
                            </td>
                            <td>
                              <label className="seat-combo">
                                <span>참석자</span>
                                <select
                                  value={seatPick[label.labelCode] ?? ""}
                                  disabled={!label.articleId || attendeeOptions.length === 0}
                                  onChange={(e) =>
                                    setSeatPick((prev) => ({
                                      ...prev,
                                      [label.labelCode]: e.target.value,
                                    }))
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
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="aims-actions">
                  <button
                    type="button"
                    className="btn-navy"
                    onClick={() => startTransition(() => loadAll())}
                    disabled={pending}
                  >
                    명패 새로고침
                  </button>
                  <button
                    type="button"
                    className="btn-navy"
                    onClick={onSaveSeats}
                    disabled={pending || !activeId}
                  >
                    Assign
                  </button>
                  <button
                    type="button"
                    className="btn-navy"
                    onClick={onPush}
                    disabled={pending || !activeId}
                  >
                    ESL 일괄 전송
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
