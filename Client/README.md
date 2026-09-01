# For Mate - Client

실종동물 매칭 서비스 For Mate의 프론트엔드입니다.

## 기술 스택

- React 18
- React Router (페이지 이동)
- Vite (개발 서버 / 빌드)
- 순수 CSS (프레임워크 없음)

## 시작하기

```bash
npm install
npm run dev
```

http://localhost:5173 에서 확인할 수 있습니다.

**백엔드도 함께 켜야 합니다.** `Server` 폴더에서 `npm run dev`로 4000 포트를 띄우면,
`vite.config.js`의 proxy 설정이 API 요청을 자동으로 백엔드로 넘겨줍니다.
(그래서 개발 중에는 CORS 설정을 따로 건드릴 필요가 없습니다.)

## 폴더 구조

```
src/
├── main.jsx            앱 시작점
├── App.jsx             전체 라우팅(주소 ↔ 페이지 연결)
├── css/                모든 스타일 (아래 설명 참고)
├── api/                백엔드 통신 함수
├── components/
│   ├── layout/         헤더, 푸터, 레이아웃, 로그인 확인
│   ├── common/         로딩·빈화면·오류·모달 등 공통 요소
│   └── post/           공고 카드, 필터 등
├── context/            로그인 정보 공유
├── hooks/              공통 로직
└── pages/              화면 (피그마 1:1 대응)
```

## CSS 규칙

모든 스타일은 `src/css/` 폴더에 모아두었습니다. **컴포넌트마다 CSS 파일을 만들지 않습니다.**

| 파일 | 역할 |
|---|---|
| `variables.css` | 색상, 여백, 글자 크기 등 값 정의 |
| `reset.css` | 브라우저 기본 스타일 초기화 |
| `layout.css` | 헤더, 푸터, 컨테이너 등 뼈대 |
| `components.css` | 버튼, 카드, 뱃지, 폼, 모달 등 공통 요소 |
| `index.css` | 위 파일들을 한 번에 불러옴 |

### 새 스타일이 필요할 때

1. 먼저 `components.css`에 비슷한 클래스가 있는지 확인하고, 있으면 그대로 사용합니다.
   (예: 버튼은 `btn btn-primary`, 카드는 `card`, 입력창은 `form-input`)
2. 여러 화면에서 쓸 스타일이면 `components.css`에 추가합니다.
3. 색상이나 여백 값은 직접 쓰지 말고 `variables.css`의 변수를 사용하세요.

```css
/* 이렇게 */
color: var(--color-primary);
padding: var(--space-md);

/* 이렇게 하지 마세요 */
color: #3d6b47;
padding: 16px;
```

4. 그 화면에서만 쓰는 복잡한 스타일이라면 그때만 `*.module.css`를 만듭니다.
   (지금은 필요한 곳이 없어서 만들지 않았습니다.)

## 자주 쓰는 클래스

| 용도 | 클래스 |
|---|---|
| 가운데 정렬 영역 | `container` |
| 페이지 제목 | `page-header` + `page-title` + `page-desc` |
| 버튼 | `btn btn-primary` / `btn btn-outline` / `btn btn-danger` / `btn btn-text` |
| 카드 | `card` / `card card-padded` / `post-card` |
| 카드 목록 | `card-grid` |
| 뱃지 | `badge badge-lost` / `badge-rescue` / `badge-ending` |
| 입력 폼 | `form-field` + `form-label` + `form-input` |
| 오류 문구 | `form-error` (입력창에는 `is-error` 추가) |
| 안내 배너 | `alert alert-success` / `alert-error` / `alert-warning` |
| 게시판 표 | `board-table` |
| 가로 배치 | `row` / `row-between` |
| 세로 배치 | `stack` |

## 페이지 ↔ 피그마 대응

각 페이지 파일 맨 위 주석에 대응하는 피그마 화면 번호와 구현할 내용을 적어두었습니다.

| 화면 | 파일 |
|---|---|
| U-01 메인 | `pages/HomePage.jsx` |
| U-02 찾고있어요 | `pages/lost/LostListPage.jsx` |
| U-03, U-04 실종 상세 | `pages/lost/LostDetailPage.jsx` |
| U-05 실종 공고 등록 | `pages/lost/LostCreatePage.jsx` |
| U-06 AI 분석 | `pages/match/AiSearchPage.jsx` |
| U-07 AI 매칭 결과 | `pages/match/MatchResultPage.jsx` |
| U-08 매칭 상세 비교 | `pages/match/MatchComparePage.jsx` |
| U-09 보호중이에요 | `pages/rescue/RescueListPage.jsx` |
| U-10 보호중이에요 상세 | `pages/rescue/RescueDetailPage.jsx` |
| U-11 발견제보 | `pages/found/FoundListPage.jsx` |
| U-12 발견제보 상세 | `pages/found/FoundDetailPage.jsx` |
| U-13 발견제보 작성 | `pages/found/FoundCreatePage.jsx` |
| C-02 회원가입 | `pages/auth/SignupPage.jsx` |
| 로그인 | `pages/auth/LoginPage.jsx` |
| 마이페이지 | `pages/mypage/MyPage.jsx` |
| 고객센터 | `pages/support/SupportPage.jsx` |
| 관리자 | `pages/admin/AdminPage.jsx` |
| S-00 공통 상태 | `components/common/Loading, Empty, ErrorState` |

## API 사용법

`src/api/` 안의 함수를 불러다 쓰면 됩니다. 응답의 `data` 부분만 돌려주므로 바로 사용할 수 있습니다.

```jsx
import { getLostPosts } from "../../api/lostPosts.api.js"
import { useFetch } from "../../hooks/useFetch.js"

const { data, loading, error } = useFetch(() => getLostPosts({ page: 1 }), [])

if (loading) return <Loading />
if (error) return <ErrorState />
```

로그인 정보가 필요하면:

```jsx
import { useAuth } from "../../context/AuthContext.jsx"

const { user, login, logout } = useAuth()
```

## 참고

- 로그인은 쿠키 방식입니다. `api/client.js`에서 `credentials: "include"`를 항상 붙이므로 따로 신경 쓸 필요가 없습니다.
- 소셜 로그인(구글/카카오)은 백엔드가 리다이렉트로 처리합니다. `goGoogleLogin()`만 호출하면 됩니다.
- 백엔드 API 주소에는 `/api/v1` 같은 접두어가 없습니다. (`/auth/login`, `/lost-posts` 형태)

## 작업 분담

| 담당 | 페이지 |
|---|---|
| | 메인, 로그인/회원가입 |
| | 찾고있어요 (목록/상세/등록) |
| | 보호중이에요, 발견제보 |
| | AI 매칭 (분석/결과/비교) |
| | 마이페이지, 고객센터, 관리자 |
