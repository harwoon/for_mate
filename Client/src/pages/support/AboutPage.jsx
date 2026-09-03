// 피그마: C-07 서비스 소개
// https://www.figma.com/design/GtiPkMM5HvQyLBhhB0Aycs/중간프로젝트?node-id=0-1
//
// 기능 (피그마 "화면 설명 | C-07" 문서 그대로)
// - 서비스 소개 확인: For Mate가 어떤 서비스인지, 어떤 흐름으로 동작하는지 한눈에 보여준다.
// - 시작 유도: "실종 공고 등록" / "발견제보 작성" 버튼으로 핵심 기능 페이지로 바로 이동시킨다.
// - 보호중 동물 보기 유도: 맨 아래 버튼으로 "보호중이에요" 목록으로 이동시킨다.
//
// TermsPage.jsx / PrivacyPage.jsx와 달리 이 페이지는 좁은 카드 하나가 아니라 화면 폭 전체를 쓰는
// "랜딩 페이지" 형태라, 구조도 다르고 전용 CSS 클래스(components.css의 "서비스소개" 섹션)를 새로 만들었다.

import { Link } from "react-router-dom"
import { useFetch } from "../../hooks/useFetch.js"
import * as pagesApi from "../../api/pages.api.js"

// 이 페이지의 내용을 아이콘 하나 없이도 이해할 수 있는 최소한의 장식만 넣는다.
// 피그마에는 이 자리에 작은 데이터베이스 모양 아이콘이 있지만, 이 프로젝트는 아이콘 라이브러리를 쓰지 않고
// (Header.jsx도 알림/마이페이지 아이콘 없이 텍스트 링크로만 구현되어 있다) 별도 이미지 파일도 없으므로,
// 피그마 아이콘을 다운로드해 새로 붙이는 대신 같은 모양의 뜻(데이터베이스)을 가진 인라인 SVG를 직접 그렸다.
// currentColor를 써서 부모 요소의 글자색(.about-banner-title의 초록색)을 그대로 물려받는다.
function DatabaseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  )
}

// 서비스소개 내용. 피그마 디자인에 있는 실제 문구를 그대로 옮겨왔고,
// 백엔드 응답이 오기 전까지(또는 실패했을 때) 화면에 보여줄 기본값으로 쓰인다.
// TermsPage.jsx/PrivacyPage.jsx의 FALLBACK_*와 같은 목적이지만, 이 페이지는 "제목+본문 문단" 구조가 아니라
// 히어로/단계별 카드/배너/버튼처럼 생김새가 다른 블록들의 모음이라 모양도 그에 맞춰 다르게 짰다.
const FALLBACK_ABOUT = {
  heroTitleLines: ["다시 소중한 가족을 만나도록", "For Mate가 함께합니다"],
  heroSubtitle:
    "For Mate는 인공지능 매칭 기술을 통해 실종된 동물과 제보 동물을 정교하게 교차 매칭해 주는 공익 플랫폼입니다.",
  heroActions: [
    { label: "실종 공고 등록", to: "/lost-posts/new", variant: "primary" },
    { label: "발견제보 작성", to: "/found-posts/new", variant: "outline" },
  ],
  stepsTitle: "서비스 흐름",
  steps: [
    { title: "실종·발견 동물 등록", description: "사진과 시간, 장소, 생김새 등 간단한 인포를 적어 등록합니다." },
    { title: "AI 사진 및 공공 데이터 매칭", description: "자체 AI 알고리즘이 발견 동물의 얼굴과 털 색을 비교해 분석합니다." },
    { title: "유사 후보 자동 알림", description: "높은 일치율의 후보가 포착되는 순간 매칭 리포트를 즉시 전송합니다." },
  ],
  banner: {
    title: "전국 공공 보호동물 연동 데이터 적용",
    description:
      "민간 제보 글뿐만 아니라, 농림축산식품부 유기동물 보호 공고 및 보호소 유기견 데이터와도 24시간 실시간 AI 얼굴 인식을 통해 동시 비교합니다.",
  },
  cta: { label: "보호중이에요 보기", to: "/rescue-animals" },
}

export default function AboutPage() {
  // 화면에 들어오자마자 백엔드에 실제 소개 문구를 요청한다. (백엔드: GET /pages/about, pages.api.js 참고)
  // 응답이 아직 없거나 실패하면 위 FALLBACK_ABOUT(피그마 원문)을 그대로 보여준다.
  // → TermsPage.jsx/PrivacyPage.jsx와 완전히 같은 "백엔드 우선, 실패 시 피그마 원문" 패턴이다.
  const { data } = useFetch(() => pagesApi.getAbout(), [])
  const about = data || FALLBACK_ABOUT

  return (
    <div className="container">
      {/* 히어로: 큰 제목 2줄 + 설명 + 시작 버튼 2개 */}
      <div className="about-hero">
        <h1 className="about-hero-title">
          {about.heroTitleLines.map((line, index) => (
            // 배열 순서가 곧 줄바꿈 순서라 인덱스를 key로 써도 안전하다. (TermsPage.jsx와 같은 이유)
            <span key={index}>
              {line}
              {index < about.heroTitleLines.length - 1 && <br />}
            </span>
          ))}
        </h1>
        <p className="about-hero-subtitle">{about.heroSubtitle}</p>
        <div className="about-hero-actions">
          {about.heroActions.map((action) => (
            // variant가 "primary"면 초록 버튼(.btn-primary), 아니면 테두리만 있는 버튼(.btn-outline).
            // 로그인 여부와 상관없이 눌러야 하는 버튼이라, 로그인이 필요한 페이지(/lost-posts/new,
            // /found-posts/new)는 App.jsx의 ProtectedRoute가 알아서 /login으로 보내준다.
            <Link
              key={action.to}
              to={action.to}
              // .about-hero-actions .btn { flex: 1 } 이 이미 두 버튼을 정확히 절반씩 나눠주기 때문에,
              // 다른 곳처럼 폭 100%를 강제하는 .btn-block은 여기서는 쓰지 않는다(둘 다 붙으면 서로 싸우는 규칙이 된다).
              className={`btn ${action.variant === "primary" ? "btn-primary" : "btn-outline"}`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 서비스 흐름: 번호가 매겨진 카드 3개 */}
      <div className="about-steps">
        <p className="about-steps-title">{about.stepsTitle}</p>
        <div className="about-steps-grid">
          {about.steps.map((step, index) => (
            <div className="step-card" key={step.title}>
              {/* 1 / 2 / 3 숫자는 서버가 내려주는 값이 아니라 배열 순서(index)로 계산한다.
                  피그마에도 이 숫자는 "몇 번째 단계인가"를 보여줄 뿐 별도 데이터가 아니기 때문이다. */}
              <div className="step-badge">{index + 1}</div>
              <div className="step-meta">
                <p className="step-title">{step.title}</p>
                <p className="step-desc">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 공공데이터 연동 배너 */}
      <div className="about-banner">
        <div className="about-banner-title">
          <DatabaseIcon />
          <span>{about.banner.title}</span>
        </div>
        <p className="about-banner-desc">{about.banner.description}</p>
      </div>

      {/* 맨 아래 CTA: 보호중이에요 목록으로 이동 (이 페이지는 누구나 볼 수 있어서 로그인 없이도 눌린다) */}
      <Link to={about.cta.to} className="btn btn-primary btn-block about-cta">
        {about.cta.label}
      </Link>
    </div>
  )
}
