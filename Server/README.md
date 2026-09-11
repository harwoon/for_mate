# For Mate - Server

실종동물과 구조동물 공고를 사진 유사도로 매칭해주는 서비스의 백엔드입니다.

## 기술 스택

- Node.js + Express
- PostgreSQL (pg)
- JWT 인증 (jsonwebtoken)
- 이미지 업로드 (multer)

## 시작하기

```bash
# 1. 패키지 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일을 열어서 DB 정보와 시크릿 키를 채워주세요

# 3. DB 준비
# 로컬 DB가 아니라 Supabase 프로젝트를 사용합니다.
# Supabase SQL Editor에서 src/db/schema.sql 실행 → migrations/ 폴더의 파일들을 번호 순서대로 실행

# 4. 서버 실행
npm run dev
```

실행 후 http://localhost:4000/health 로 확인할 수 있습니다.

## 폴더 구조

```
src/
├── server.js          # 서버 실행
├── app.js             # 라우터 연결
├── db/
│   ├── pool.js        # DB 연결
│   └── schema.sql     # 테이블 생성 SQL
├── modules/           # 기능별 폴더 (아래 표 참고)
├── middleware/        # 인증, 에러 처리, 파일 업로드
├── constants/         # 상태값, 색상 태그 등 고정값
├── utils/             # 응답 형식, 페이지네이션
└── jobs/              # 새벽 배치 작업
```

## 기능별 폴더 (modules)

API 명세서의 장 번호와 같은 순서입니다.

| 폴더 | 담당 API | 설명 |
|---|---|---|
| `auth/` | 1장 | 회원가입, 로그인, 토큰, 소셜 로그인 |
| `catalog/` | 2장 | 품종/색상/지역 목록 (필터, 자동완성용) |
| `lost-posts/` | 3장 | 실종 공고 (찾고있어요) |
| `found-posts/` | 4장 | 발견제보 |
| `rescue-animals/` | 5장 | 구조동물 공고 (보호중이에요). 공공데이터 + 포인핸드 두 출처를 `animal-source.js`로 통합 조회 |
| `matches/` | 6장 | AI 매칭 |
| `bookmarks/` | 7장 | 북마크 |
| `my/` | 8장 | 마이페이지 |
| `faqs/` | - | 자주 묻는 질문 (공개 조회는 여기, 등록/수정/삭제는 `admin/`) |
| `notifications/` | 9장 | 알림 목록 조회 (생성은 배치가 담당) |
| `reports/` | 10장 | 신고 |
| `inquiries/` | 11장 | 고객센터 문의 |
| `pages/` | 12장 | 이용약관 등 정적 페이지 |
| `admin/` | - | 관리자 기능 |

## 각 폴더 안의 파일 역할

```
modules/lost-posts/
├── lost-posts.router.js      # 어떤 주소로 요청이 오는지
├── lost-posts.controller.js  # 요청값을 꺼내고 응답을 보냄
├── lost-posts.service.js     # 실제 처리 로직
└── lost-posts.repository.js  # DB 쿼리
```

각 기능은 `router → controller → service → repository` 구조로 구현되어 있습니다.

## 배치 잡 (jobs/)

| 파일 | 역할 |
|---|---|
| `rescueAnimalSync.job.js` | 공공데이터 구조동물 수집 → DB 저장 → AI 서버에 임베딩 추출 요청 → 신규 매칭 알림 생성 |
| `pawinhandSync.job.js` | 포인핸드 구조동물 수집 → 동일 파이프라인 |
| `notifyNewMatches.js` | 두 배치가 공용으로 쓰는 알림 생성 로직 |
| `scheduler.js` | 새벽 4시/5시(KST)에 위 두 배치를 자동 실행 |

이미지 업로드는 로컬 디스크가 아니라 **Cloudflare R2**에 저장됩니다 (`utils/r2.js`). AI 서버(FastAPI, `../ML/ai_server`)가 별도로 켜져 있어야 임베딩 추출이 실제로 동작합니다 — `.env`의 `AI_SERVER_URL`로 연결됩니다.

## 작업 분담

| 담당 | 폴더 |
|---|---|
| | `auth/`, `reports/`, `inquiries/` |
| | `catalog/`, `notifications/`, `my/` |
| | `rescue-animals/`, `matches/`, `jobs/` |
| | `lost-posts/`, `found-posts/` |
| | AI/ML 서버 (`../ML/ai_server`, 같은 모노레포 안) |

## 참고

- 매칭 대상은 **구조동물 공고(공공데이터) + 포인핸드 공고**입니다. 발견제보는 매칭에 포함되지 않습니다.
- 매칭 결과는 요청할 때마다 실시간으로 재계산합니다 (임베딩은 등록/배치 시점에 이미 계산돼 있어 pgvector 거리 계산만 하면 되므로 부담이 적습니다). `matches` 테이블은 조회용 캐시가 아니라 이력 기록용이며, 같은 날 같은 쌍이면 최신 값으로 upsert합니다.
- 매칭 후보 제외(`match_exclusions`) 기능은 1차 범위에서 제외되었습니다.
- 종(species)이 다르면 매칭 후보에서 제외되고, 공고 종료일(`notice_edt`)이 지난 개체도 제외됩니다.