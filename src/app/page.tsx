export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <span className="badge">SoluM AIMS SaaS · 회의실 ESL</span>
        <h1>회의실 전자명패 연동 플랫폼</h1>
        <p>
          회의명과 참석자 정보를 AIMS Article로 동기화하면, Newton 전자명패에 표시됩니다.
          AIMS 대시보드에서 라벨 템플릿에 MEETING_NAME, ATTENDEES 필드를 매핑해 두세요.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>연결 상태</h2>
          <p>AIMS SaaS 인증 및 Store ID 확인</p>
          <code>GET /api/aims/status</code>
        </article>

        <article className="card">
          <h2>회의 정보 동기화</h2>
          <p>회의명·참석자를 전자명패에 반영</p>
          <code>POST /api/webhooks/meeting</code>
        </article>

        <article className="card">
          <h2>라벨 조회</h2>
          <p>전자명패 목록 및 상태 확인</p>
          <code>GET /api/aims/labels</code>
        </article>

        <article className="card">
          <h2>헬스체크</h2>
          <p>Railway 배포 상태 모니터링</p>
          <code>GET /api/health</code>
        </article>
      </section>
    </main>
  );
}
