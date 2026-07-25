"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
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

/** articleId + Product Name → "1(명패1)" */
function formatArticleCell(articleId: string, articleName?: string): string {
  const id = articleId.trim();
  const name = articleName?.trim() ?? "";

  if (name && name !== id) {
    return `${id}(${name})`;
  }

  const match = id.match(/^명패(\d+)$/);
  if (match) {
    return `${match[1]}(${id})`;
  }

  return id;
}

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
  const [tab, setTab] = useState<MainTab>("meeting");
  const tableWrapRef = useRef<HTMLDivElement>(null);

  function scrollTable(direction: "left" | "right") {
    tableWrapRef.current?.scrollBy({
      left: direction === "left" ? -180 : 180,
      behavior: "smooth",
    });
  }

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

  function currentSeatAssignments(): SeatAssignment[] {
    return labels
      .filter((label) => seatPick[label.labelCode] && label.articleId)
      .map((label) => ({
        labelCode: label.labelCode,
        articleId: label.articleId,
        attendeeName: seatPick[label.labelCode],
      }));
  }

  async function persistSeats(seats = currentSeatAssignments()): Promise<number> {
    if (!activeId) {
      throw new Error("먼저 회의를 저장하세요.");
    }

    await apiFetch(`/api/meetings/${activeId}`, {
      method: "PUT",
      body: JSON.stringify({ seats }),
    });
    return seats.length;
  }

  function seatsForClear(): SeatAssignment[] {
    const fromPick = currentSeatAssignments();
    if (fromPick.length > 0) return fromPick;
    return activeMeeting?.seats.filter((s) => s.articleId && s.attendeeName) ?? [];
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
          body: JSON.stringify({}),
        });
        setMessage(`전자명패 ${result.pushed}장 전송 완료.`);
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "전송 실패");
        await loadAll();
      }
    });
  }

  async function onAssignOne(labelCode: string) {
    if (!activeId) return;
    const attendeeName = seatPick[labelCode]?.trim() ?? "";
    if (!attendeeName) {
      setError("참석자를 선택한 뒤 할당하세요.");
      return;
    }
    const label = labels.find((l) => l.labelCode === labelCode);
    if (!label?.articleId) {
      setError("해당 명패에 Article이 없습니다.");
      return;
    }

    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await persistSeats();
        await apiFetch<{ pushed: number }>(`/api/meetings/${activeId}/push`, {
          method: "POST",
          body: JSON.stringify({ labelCode }),
        });
        setMessage(
          `${attendeeName} → ${formatArticleCell(label.articleId, label.articleName)} 할당 완료.`,
        );
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "할당 실패");
        await loadAll();
      }
    });
  }

  async function onCancelOne(labelCode: string) {
    if (!activeId) return;
    const attendeeName = seatPick[labelCode]?.trim() ?? "";
    const fromSaved = activeMeeting?.seats.find((s) => s.labelCode === labelCode);
    const label = labels.find((l) => l.labelCode === labelCode);

    let seat =
      seatsForClear().find((s) => s.labelCode === labelCode) ?? fromSaved ?? null;
    if (!seat && label?.articleId) {
      seat = {
        labelCode,
        articleId: label.articleId,
        attendeeName: attendeeName || fromSaved?.attendeeName || "",
      };
    }

    if (!seat?.articleId) {
      setError("취소할 할당이 없습니다.");
      return;
    }

    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await apiFetch<{ cleared: number }>(
          `/api/meetings/${activeId}/clear`,
          {
            method: "POST",
            body: JSON.stringify({ labelCode, seats: [seat] }),
          },
        );
        setSeatPick((prev) => {
          const next = { ...prev };
          delete next[labelCode];
          return next;
        });
        const who = attendeeName || seat.attendeeName || labelCode;
        setMessage(`${who} 할당 취소 완료. (${result.cleared}건)`);
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "할당 취소 실패");
        await loadAll();
      }
    });
  }

  async function onCancelAll() {
    if (!activeId) return;
    const seats = seatsForClear();
    if (seats.length === 0) {
      setError("취소할 할당이 없습니다.");
      return;
    }
    if (!window.confirm(`배정된 명패 ${seats.length}건의 할당을 모두 취소할까요?`)) {
      return;
    }

    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await apiFetch<{ cleared: number }>(
          `/api/meetings/${activeId}/clear`,
          {
            method: "POST",
            body: JSON.stringify({ seats }),
          },
        );
        setSeatPick({});
        setMessage(`전체 할당 취소 완료. (${result.cleared}건)`);
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : "전체 할당 취소 실패");
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
        <div className="aims-logo">전자명패</div>
        <nav className="aims-menu">
          <div className="aims-menu-group">
            <div className="aims-menu-title">
              명패 설정& 배정
              <span className="chev">▾</span>
            </div>
            <ul className="aims-submenu">
              <li>
                <button
                  type="button"
                  className={`aims-menu-item ${tab === "meeting" ? "active" : ""}`}
                  onClick={() => setTab("meeting")}
                >
                  회의설정
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`aims-menu-item ${tab === "assign" ? "active" : ""}`}
                  onClick={() => setTab("assign")}
                >
                  명패할당
                </button>
              </li>
            </ul>
          </div>
        </nav>
        <div className="aims-sidebar-foot">
          <button type="button" className="aims-menu-item" onClick={logout}>
            로그아웃
          </button>
        </div>
      </aside>

      <div className="aims-main">
        <div className="aims-content">
          <div className="aims-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "meeting"}
              className={`aims-tab ${tab === "meeting" ? "active" : ""}`}
              onClick={() => setTab("meeting")}
            >
              회의설정
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "assign"}
              className={`aims-tab ${tab === "assign" ? "active" : ""}`}
              onClick={() => setTab("assign")}
            >
              명패할당
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
                </div>

                {!activeMeeting ? (
                  <p className="aims-empty-banner">회의를 먼저 선택하거나 회의설정에서 저장하세요.</p>
                ) : labels.length === 0 ? (
                  <p className="aims-empty-banner">사용 가능한 데이터 없음</p>
                ) : (
                  <div className="aims-table-scroll">
                    <div className="aims-table-scroll-hint">
                      <button
                        type="button"
                        className="aims-scroll-arrow left"
                        aria-label="왼쪽으로 스크롤"
                        onClick={() => scrollTable("left")}
                      >
                        ‹
                      </button>
                      <span>좌우로 스크롤하세요</span>
                      <button
                        type="button"
                        className="aims-scroll-arrow right"
                        aria-label="오른쪽으로 스크롤"
                        onClick={() => scrollTable("right")}
                      >
                        ›
                      </button>
                    </div>
                    <div className="aims-table-wrap" ref={tableWrapRef}>
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
                          {labels.map((label, index) => {
                            const selectedName = seatPick[label.labelCode] ?? "";
                            const canAssign =
                              Boolean(label.articleId) && Boolean(selectedName) && !pending;
                            const canCancel =
                              Boolean(label.articleId) &&
                              (Boolean(selectedName) ||
                                Boolean(
                                  activeMeeting.seats.some((s) => s.labelCode === label.labelCode),
                                )) &&
                              !pending;
                            return (
                              <tr key={label.labelCode}>
                                <td>{index + 1}</td>
                                <td>
                                  <p className="seat-code">{label.labelCode}</p>
                                </td>
                                <td>
                                  <span className={label.online ? "dot on" : "dot off"} />
                                  {label.online ? "Online" : "Offline"}
                                  {label.battery ? ` · ${label.battery}` : ""}
                                </td>
                                <td>
                                  {label.articleId ? (
                                    <div>
                                      {formatArticleCell(label.articleId, label.articleName)}
                                    </div>
                                  ) : (
                                    <span style={{ color: "var(--danger)" }}>Article 없음</span>
                                  )}
                                </td>
                                <td>
                                  <div className="seat-row-actions">
                                    <label className="seat-combo">
                                      <span>참석자</span>
                                      <select
                                        value={selectedName}
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
                                    <button
                                      type="button"
                                      className="btn-navy tiny"
                                      disabled={!canAssign}
                                      onClick={() => onAssignOne(label.labelCode)}
                                    >
                                      할당
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-ghost danger tiny"
                                      disabled={!canCancel}
                                      onClick={() => onCancelOne(label.labelCode)}
                                    >
                                      할당취소
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
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
                    onClick={onPush}
                    disabled={pending || !activeId}
                  >
                    ESL 일괄 전송
                  </button>
                  <button
                    type="button"
                    className="btn-ghost danger"
                    onClick={onCancelAll}
                    disabled={pending || !activeId || seatsForClear().length === 0}
                  >
                    전체 할당 취소
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
