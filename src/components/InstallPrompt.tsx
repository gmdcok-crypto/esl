"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "esl_install_dismissed_at";
const DISMISS_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 900px)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/i.test(ua);
  const chrome = /CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(ua);
  return iOS && webkit && !chrome;
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently() || !isMobileViewport()) {
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      setDeferred(promptEvent);
      setIosHint(false);
      setOpen(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS has no beforeinstallprompt — show Add to Home Screen guide.
    if (isIosSafari()) {
      setIosHint(true);
      setOpen(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  async function onInstall() {
    if (iosHint || !deferred) return;
    setBusy(true);
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setOpen(false);
        setDeferred(null);
      } else {
        markDismissed();
        setOpen(false);
      }
    } catch {
      markDismissed();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function onDismiss() {
    markDismissed();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="install-backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="install-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        aria-describedby="install-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="install-icon" aria-hidden>
          <img src="/icons/icon-192.png" alt="" width={48} height={48} />
        </div>
        <h2 id="install-title">명패 앱 설치</h2>
        <p id="install-desc">
          {iosHint
            ? "홈 화면에 추가하면 앱처럼 바로 실행할 수 있습니다. 공유 버튼을 누른 뒤 「홈 화면에 추가」를 선택하세요."
            : "홈 화면에 설치하면 앱처럼 빠르게 실행할 수 있습니다. 지금 설치할까요?"}
        </p>
        <div className="install-actions">
          {iosHint ? (
            <button type="button" className="btn-navy" onClick={onDismiss}>
              확인
            </button>
          ) : (
            <button type="button" className="btn-navy" onClick={onInstall} disabled={busy || !deferred}>
              {busy ? "설치 중…" : "설치"}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onDismiss} disabled={busy}>
            나중에
          </button>
        </div>
      </div>
    </div>
  );
}
