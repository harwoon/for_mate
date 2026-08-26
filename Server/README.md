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

# 3. DB 테이블 생성
psql -d formate -f src/db/schema.sql

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
| `rescue-animals/` | 5장 | 구조동물 공고 (보호중이에요) |
| `matches/` | 6장 | AI 매칭 |
| `bookmarks/` | 7장 | 북마크 |
| `my/` | 8장 | 마이페이지 |
| `notifications/` | 9장 | 알림 |
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

요청은 `router → controller → service → repository` 순서로 흘러갑니다.

**auth 폴더는 회원가입/로그인이 실제로 동작하도록 구현해두었습니다.** 다른 기능을 만들 때 이 폴더를 참고하시면 됩니다. 나머지 controller는 `501 NOT_IMPLEMENTED`를 반환하도록 되어 있으니, TODO 주석을 보고 채워주세요.

## 작업 분담

| 담당 | 폴더 |
|---|---|
| | `auth/`, `reports/`, `inquiries/` |
| | `catalog/`, `notifications/`, `my/` |
| | `rescue-animals/`, `matches/`, `jobs/` |
| | `lost-posts/`, `found-posts/` |
| | AI/ML 서버 (별도 저장소) |

## 참고

- 매칭 대상은 **구조동물 공고만** 입니다. 발견제보는 매칭에 포함되지 않습니다.
- 매칭 결과는 하루에 한 번만 계산하고, 같은 날 재요청하면 저장된 결과를 그대로 보여줍니다.
- 매칭 피드백 기능은 1차 범위에서 제외되었습니다.
