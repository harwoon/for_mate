# forMate

AI 기반 반려동물 실종·발견 매칭 플랫폼. 실종 공고 사진과 전국 보호소(공공데이터)·포인핸드(pawinhand.kr) 구조동물 사진을 이미지 임베딩으로 비교해, 잃어버린 동물과 가장 닮은 보호 중인 동물을 찾아준다.


## 핵심 기능

- **실종/발견/구조동물 게시판** — 실종 신고, 발견 제보, 공공데이터+포인핸드 구조동물 통합 조회
- **AI 유사 매칭** — 실종 공고 사진과 구조동물 사진의 임베딩을 pgvector로 비교, 종(species)·공고 종료 여부를 반영해 유사도 높은 순으로 후보 제시
- **자동 알림** — 새벽 배치가 신규 구조동물을 수집하면서, 임계값 이상 유사한 실종 공고 주인에게 알림 생성
- **북마크 / 마이페이지 / 관리자 대시보드** — 사용자용 부가 기능 및 관리자용 신고·문의·매칭 이력 관리

## 프로젝트 구조

```
for_mate/
├── Client/       # React (Vite) 프론트엔드
├── Server/       # Node.js (Express) 백엔드 API + 배치 잡
└── ML/           # 이미지 임베딩 추출용 AI 서버(FastAPI) + 모델 연구/학습 코드
```

세 폴더는 서로 다른 언어/런타임을 쓰는 독립된 서비스라, **개발할 때 세 개를 각각 따로 실행**해야 한다.

## 기술 스택

| 영역 | 스택 |
|---|---|
| 프론트엔드 | React 18, Vite, React Router |
| 백엔드 | Node.js, Express, node-cron(배치 스케줄러) |
| DB | PostgreSQL (Supabase), pgvector 확장 |
| 파일 저장소 | Cloudflare R2 |
| AI 서버 | Python, FastAPI, PyTorch, timm (MegaDescriptor 기반 이미지 임베딩), torchvision(Faster R-CNN 동물 탐지) |
| 인증 | JWT (Access/Refresh) + 쿠키, Google/Kakao OAuth |
| 외부 데이터 | 국가동물보호정보시스템 공공데이터 API, 포인핸드(pawinhand.kr) RSS/크롤링 |

## 시작하기

### 0. 사전 준비

- Node.js 20+
- Python 3.11 (가상환경 권장)
- Supabase 프로젝트 (PostgreSQL + `vector` 확장 활성화)
- Cloudflare R2 버킷 (Public Access 또는 Custom Domain 설정)

### 1. 백엔드 (`Server/`)

```bash
cd Server
npm install
cp ../.env.example .env   # 값 채워넣기 (아래 환경변수 참고)
npm run dev                # http://localhost:4000
```

### 2. AI 서버 (`ML/ai_server/`)

```bash
cd ML
python -m venv .venv
.venv\Scripts\activate      # Windows / macOS-Linux는 source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # DATABASE_URL 등 채워넣기
```

`ML/checkpoints/` 밑에 파인튜닝된 모델 가중치(`megadescriptor_mpdd_best.pth`)가 있어야 한다 (git에 미포함, 별도 공유).

```bash
cd ai_server
uvicorn main:app --port 8001   # http://localhost:8001
```

### 3. 프론트엔드 (`Client/`)

```bash
cd Client
npm install
npm run dev                 # http://localhost:5173
```

세 개를 모두 켠 상태에서 프론트엔드로 접속하면 전체 기능이 동작한다.

## 환경변수

루트 `.env.example`(백엔드용)과 `ML/.env.example`(AI 서버·배치용)을 참고. 주요 항목:

| 변수 | 설명 |
|---|---|
| `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase 프로젝트 접속 정보 |
| `JWT_SECRET`, `JWT_EXPIRES_SEC`, `REFRESH_TOKEN_EXPIRES_DAYS` | 인증 토큰 설정 |
| `GOOGLE_CLIENT_ID/SECRET`, `KAKAO_REST_API_KEY/SECRET` | 소셜 로그인 |
| `AI_SERVER_URL` | 백엔드가 호출하는 FastAPI 주소 |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | 이미지 저장소(Cloudflare R2) |
| `APIS_KEY`, `APIS_URL` | 국가동물보호정보시스템 공공데이터 API |
| `OPENAI_API_KEY` | 구조동물 색상 태그 정규화(LLM) |

## 배치 잡 (새벽 자동 동기화)

| 명령 | 역할 |
|---|---|
| `npm run job:sync` | 공공데이터 구조동물 수집 → DB 저장 → 임베딩 추출 → 신규 매칭 알림 생성 |
| `npm run job:pawinhand-sync` | 포인핸드 구조동물 수집 → 동일 파이프라인 |
| `npm run job:backfill-region` | 기존 데이터 지역명 보정용 1회성 스크립트 |

두 동기화 잡은 `Server/src/jobs/scheduler.js`에 등록된 크론(새벽 4시/5시, KST)으로 매일 자동 실행된다. 로컬에서 즉시 테스트할 때는 위 명령을 직접 실행하면 되고, 이때 AI 서버(FastAPI)가 함께 켜져 있어야 임베딩 추출까지 끝까지 진행된다.

## API 구조 (백엔드)

`Server/src/modules/` 아래 기능별로 분리돼 있다: `auth`, `lost-posts`, `found-posts`, `rescue-animals`, `matches`, `notifications`, `bookmarks`, `my`(마이페이지), `reports`, `inquiries`, `faqs`, `admin`. 각 모듈은 `router → controller → service → repository` 4계층 구조를 따른다.

전체 API 명세서는 팀 Confluence에서 관리한다.

## ML / AI 서버

- `ML/ai_server/main.py` — 운영에 실제로 쓰이는 FastAPI 서버. 이미지 크롭(Faster R-CNN) + 임베딩 추출(MegaDescriptor) + DB 저장을 담당한다.
- `ML/notebooks/`, `ML/scripts/` — 모델 학습·실험 코드 (MegaDescriptor/PetFace 파인튜닝, ARBase 자체 구현, 하드 evaluation 세트 구축 등). 자세한 내용은 [`ML/README.md`](./ML/README.md) 참고.


## 배포 참고

- DB·파일 저장소는 Supabase / Cloudflare R2로 이미 클라우드에 있어, 백엔드·AI 서버만 별도 호스팅하면 된다.
- 프론트엔드와 백엔드 도메인이 다르면 쿠키 인증(`sameSite`) 설정을 확인해야 한다.
- 새벽 배치는 서버가 상시 켜져 있어야 크론이 동작한다 (무료 플랜의 슬립 정책 주의).