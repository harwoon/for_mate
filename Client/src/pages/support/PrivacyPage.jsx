// 피그마: C-04 개인정보처리방침
// https://www.figma.com/design/GtiPkMM5HvQyLBhhB0Aycs/중간프로젝트?node-id=0-1
//
// 기능 (피그마 "화면 설명 | C-04" 문서 그대로)
// - 개인정보 수집 항목 확인: 서비스 이용을 위해 수집하는 개인정보 항목을 확인한다.
// - 개인정보 이용 목적 확인: 회원 관리 및 서비스 제공을 위한 개인정보 이용 목적을 확인한다.
// - 개인정보 보유 기간 확인: 수집한 개인정보의 보유 기간과 파기 기준을 확인한다.
// - 개인정보처리방침 확인 완료: "내용을 모두 확인했습니다" 버튼을 누르면 C-02 회원가입 페이지로 이동한다.
// - 동의 상태 반영: 회원가입 페이지로 돌아가면 기존 입력값이 유지되고 개인정보 수집·이용 동의 상태가 반영된다.
//
// 구조와 원리는 TermsPage.jsx와 완전히 같다. (같은 방식을 그대로 재사용해서 두 페이지의 동작을 통일했다)
// 두 파일을 하나로 합치지 않은 이유: 제목/본문 데이터와 화면 주소(/terms, /privacy)가
// 서로 다르고, 피그마에서도 C-03/C-04가 별개 화면으로 정의돼 있어서 각자 독립된 페이지로 두는 게
// 나중에 한쪽만 수정할 때(예: 개인정보처리방침만 조항 추가) 더 다루기 쉽다.

import { useNavigate } from "react-router-dom"
import { useFetch } from "../../hooks/useFetch.js"
import * as pagesApi from "../../api/pages.api.js"

// 개인정보처리방침 본문. 피그마 디자인의 실제 문구를 그대로 옮겨왔고,
// 백엔드 응답이 오기 전까지 화면에 보여줄 기본값으로 쓰인다.
const FALLBACK_PRIVACY = {
  title: "개인정보 수집 및 처리 방침",
  sections: [
    {
      heading: "1. 개인정보 수집 항목",
      body: [
        "회사는 회원가입, 원활한 고객 상담, 다양한 서비스의 제공을 위해 최초 회원가입 시 아래와 같은 개인정보를 수집하고 있습니다.",
        "- 필수항목: 이메일 주소, 비밀번호, 닉네임, 기기 고유 식별값",
      ],
    },
    {
      heading: "2. 수집 및 이용 목적",
      body: [
        "- 회원 가입 및 본인 확인",
        "- 실종동물 발견제보에 관한 유선/알림 연락망 확보",
        "- 인공지능 기반 분석 매칭 정보 전달",
      ],
    },
    {
      heading: "3. 보유 및 이용기간",
      body: [
        "회원의 개인정보는 회원 탈퇴 시 지체 없이 파기하며, 관련 법령의 규정에 의하여 일정 기간 보존이 필요한 경우 관련 보존 기준을 준수합니다.",
      ],
    },
  ],
}

// SignupPage.jsx의 "개인정보 수집 및 이용 동의" 체크박스와 통신할 때 쓰는 key.
// TermsPage.jsx의 AGREE_SIGNAL_KEY와 이름만 다를 뿐 원리는 동일하다.
const AGREE_SIGNAL_KEY = "formate:agree-privacy"

export default function PrivacyPage() {
  const navigate = useNavigate()

  // 백엔드 연동 방식은 TermsPage.jsx와 동일하다: 실제로 GET /pages/privacy를 호출해보고,
  // 아직 구현되지 않아 실패하는 동안에는 FALLBACK_PRIVACY(피그마 원문)를 대신 보여준다.
  const { data } = useFetch(() => pagesApi.getPrivacy(), [])
  const privacy = data || FALLBACK_PRIVACY

  function handleConfirm() {
    // 다른 탭(회원가입 탭)에 "개인정보 처리방침을 확인/동의했다"는 신호를 보낸다.
    // 자세한 원리는 TermsPage.jsx의 handleConfirm 주석 참고.
    localStorage.setItem(AGREE_SIGNAL_KEY, String(Date.now()))
    window.close()
    navigate("/signup")
  }

  return (
    <div className="container auth-page">
      <div className="card card-padded auth-card">
        <div className="auth-card-header">
          <p className="auth-card-title">{privacy.title}</p>
        </div>

        <div className="legal-sections">
          {privacy.sections.map((section) => (
            <div className="legal-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {/* 여러 줄짜리 본문(예: "2. 수집 및 이용 목적"의 - 항목 3개)을 별도 래퍼로 감싸는 이유는
                  TermsPage.jsx의 같은 부분 주석 참고. 요약하면: .legal-section의 flex gap이 본문 줄
                  사이사이에도 끼어들지 않도록, 여러 줄을 하나의 블록(.legal-section-body)으로 묶는다. */}
              <div className="legal-section-body">
                {section.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={handleConfirm}>
          내용을 모두 확인했습니다
        </button>
      </div>
    </div>
  )
}
