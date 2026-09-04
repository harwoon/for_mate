// 피그마: C-06 | 404/오류
// https://www.figma.com/design/GtiPkMM5HvQyLBhhB0Aycs/중간프로젝트?node-id=0-1
//
// 구현할 내용:
// - 존재하지 않는 주소로 들어왔을 때 보여줄 안내 화면 (App.jsx의 <Route path="*"> 가
//   모든 경우에 이 페이지로 연결한다)
// - 메인으로 돌아가는 버튼
//
// 참고: 원래 고객센터 페이지(SupportPage.jsx) 작업을 하다가("피그마 C-05, C-06을 그대로
// 구현해줘"라는 요청) C-06이 "고객센터 안의 오류 화면"이 아니라 사이트 전체에서 공용으로
// 쓰는 404 화면이라는 걸 확인했다. 그래서 고객센터 관련 컴포넌트가 아니라, App.jsx의
// catch-all 라우트(path="*")가 원래부터 가리키고 있던 이 파일에 그대로 구현했다.

import { Link } from "react-router-dom"

// help-circle 아이콘. 프로젝트에 Figma 아이콘 asset을 그대로 내려받아 쓰는 곳이 없어서
// (SupportPage.jsx의 ChevronDownIcon, AboutPage.jsx의 DatabaseIcon과 같은 이유) 원과
// 물음표, 점만으로 간단히 직접 그렸다.
function HelpCircleIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9.2 9.3a2.8 2.8 0 1 1 4.4 2.3c-.9.6-1.6 1.1-1.6 2.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="17.2" r="1" fill="currentColor" />
    </svg>
  )
}

export default function NotFoundPage() {
  return (
    <div className="container notfound-page">
      <div className="notfound-icon-wrap">
        <HelpCircleIcon />
      </div>

      <div className="notfound-text">
        <h1 className="notfound-title">페이지를 찾을 수 없어요</h1>
        <p className="text-sub">
          요청하신 페이지가 존재하지 않거나,
          <br />
          이동 또는 삭제되었을 수 있습니다.
        </p>
      </div>

      {/* 피그마에서 이 버튼은 배경 없이 초록 글자만 있는 형태지만, 프로젝트 전체에 그런
          "테두리도 배경도 없는 초록 글자 버튼" 클래스가 없다(.btn-text는 회색, .btn-outline은
          검은 글자다). 이 화면 하나만을 위해 새 버튼 스타일을 추가하기보다는, 다른 화면의
          "메인으로" 버튼(LoginPage.jsx의 로그인 성공 모달 등)과 똑같이 이미 있는
          .btn.btn-primary를 재사용해 앱 전체에서 "메인으로 이동" 버튼이 항상 같은 모양으로
          보이게 했다. */}
      <Link to="/" className="btn btn-primary btn-block">
        메인으로 이동
      </Link>
    </div>
  )
}
