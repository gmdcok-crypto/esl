import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <div className="landing-atmosphere" aria-hidden />
      <header className="landing-nav">
        <span className="brand-mark">명패</span>
        <Link className="btn-ghost" href="/login">
          로그인
        </Link>
      </header>

      <section className="landing-hero">
        <p className="brand-hero">명패</p>
        <h1>회의실 전자명패를 한곳에서</h1>
        <p className="landing-copy">
          회의명, 참석자, 주관기관만 입력하면 Newton 명패로 바로 전송합니다.
        </p>
        <div className="cta-row">
          <Link className="btn-primary" href="/login">
            시작하기
          </Link>
          <Link className="btn-ghost" href="/app">
            워크스페이스
          </Link>
        </div>
      </section>
    </main>
  );
}
