# ESL Platform

SoluM AIMS SaaS 기반 전자명패(ESL) 연동 플랫폼입니다.  
POS/ERP에서 상품·가격 데이터를 받아 AIMS로 동기화하고, 라벨 상태를 API로 조회합니다.

## 아키텍처

```
POS / ERP ──webhook──▶ 이 플랫폼 (Railway) ──REST API──▶ SoluM AIMS SaaS
                                                              │
                                                         Newton Gateway
                                                              │
                                                         전자명패 (ESL)
```

## 주요 API

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 서비스 헬스체크 (Railway) |
| GET | `/api/aims/status` | AIMS 연결 및 매장 정보 |
| GET | `/api/aims/products` | 상품 목록 조회 |
| GET | `/api/aims/labels` | 전자명패 목록 조회 |
| POST | `/api/webhooks/pos` | POS 상품 동기화 |

### POS 동기화 예시

```bash
curl -X POST https://your-app.railway.app/api/webhooks/pos \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-secret" \
  -d '[{"sku":"A001","name":"상품명","price":9900,"currency":"KRW"}]'
```

## 환경 변수

`.env.example`을 참고해 `.env` 파일을 만듭니다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `AIMS_BASE_URL` | O | `https://asia.common.solumesl.com` (아시아 리전) |
| `AIMS_USERNAME` | O | AIMS 관리자 이메일 (Azure AD B2C) |
| `AIMS_PASSWORD` | O | AIMS 관리자 비밀번호 |
| `AIMS_COMPANY_CODE` | | 토큰 갱신 시 필요 (SoluM에서 발급) |
| `AIMS_STORE_ID` | | 매장 ID |
| `AIMS_TENANT_ID` | | 테넌트 ID |
| `WEBHOOK_SECRET` | | POS webhook 인증 시크릿 |

### AIMS 인증 방식

SoluM AIMS는 **고정 API 키가 없습니다.** 서버가 Login API를 호출해 Bearer Token을 동적으로 발급받습니다.

```
서버 시작 / API 호출 직전
  └─ POST /common/api/v2/token  (username + password)
       └─ access_token (24시간 유효)
            └─ AIMS API 호출 시 Authorization: Bearer {token}
  └─ 만료 시 POST /common/api/v2/token/refresh (companyCode + refreshToken)
```

Railway 환경 변수에 `AIMS_USERNAME`, `AIMS_PASSWORD`만 설정하면 토큰 발급·갱신은 자동 처리됩니다.

> API 문서: https://asia.common.solumesl.com/docs/tutorial/token_generation

## 로컬 실행

```bash
npm install
cp .env.example .env
npm run dev
```

## Railway 배포

1. [Railway](https://railway.app)에서 **New Project → Deploy from GitHub repo** 선택
2. `gmdcok-crypto/esl` 레포지토리 연결
3. 환경 변수 설정:
   - `AIMS_BASE_URL` = `https://asia.common.solumesl.com`
   - `AIMS_USERNAME` = AIMS 관리자 이메일
   - `AIMS_PASSWORD` = AIMS 관리자 비밀번호
   - `AIMS_COMPANY_CODE` = (선택) 토큰 자동 갱신용
4. 배포 후 `GET /api/health`로 상태 확인

`railway.toml`에 빌드/헬스체크 설정이 포함되어 있습니다.

## 개발 로드맵

- [x] SoluM AIMS Login API 동적 토큰 발급/갱신
- [ ] 상품-라벨 매핑 관리 UI
- [ ] 프로모션/가격 일괄 변경
- [ ] 라벨 배터리·오프라인 알림
- [ ] 다매장 지원
