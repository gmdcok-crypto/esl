export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <span className="badge">SoluM AIMS SaaS</span>
        <h1>전자명패(ESL) 연동 플랫폼</h1>
        <p>
          POS/ERP 데이터를 AIMS로 동기화하고, 상품·라벨 상태를 API로 관리합니다.
          Railway에 배포한 뒤 환경 변수만 설정하면 바로 연동할 수 있습니다.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>연결 상태</h2>
          <p>AIMS SaaS 인증 및 매장 정보 확인</p>
          <code>GET /api/aims/status</code>
        </article>

        <article className="card">
          <h2>상품 동기화</h2>
          <p>POS에서 전달된 상품 정보를 AIMS에 반영</p>
          <code>POST /api/webhooks/pos</code>
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
