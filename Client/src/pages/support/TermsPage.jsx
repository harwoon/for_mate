// 피그마: C-03 이용약관
// https://www.figma.com/design/GtiPkMM5HvQyLBhhB0Aycs/중간프로젝트?node-id=0-1
//
// 기능 (피그마 "화면 설명 | C-03" 문서 그대로)
// - 이용약관 확인: 서비스 이용 목적, 용어의 정의, 약관의 제정과 효력 등 약관 내용을 확인한다.
// - 약관 확인 완료: "내용을 모두 확인했습니다" 버튼을 누르면 C-02 회원가입 페이지로 이동한다.
// - 동의 상태 반영: 회원가입 페이지로 돌아가면 기존 입력값이 유지되고 이용약관 동의 상태가 반영된다.
//
// ↓ 아래에 "왜 이렇게 만들었는지"를 블록마다 주석으로 설명해둔다.

import { useNavigate } from "react-router-dom"
import { useFetch } from "../../hooks/useFetch.js"
import * as pagesApi from "../../api/pages.api.js"

// 약관 본문은 피그마 디자인에 있는 실제 문구를 그대로 옮겨왔다.
// 백엔드에서 값을 받아오기 전까지 화면에 보여줄 "기본값"으로 쓰인다. (아래 컴포넌트 본문 참고)
// heading: 조항 제목, body: 문단들의 배열 (여러 줄이면 배열 원소를 여러 개로 나눈다)
const FALLBACK_TERMS = {
  title: "For Mate 서비스 이용 약관",
  sections: [
    {
      heading: "제 1 조 (목적)",
      body: [
        `본 약관은 For Mate(이하 "회사")가 제공하는 반려동물 실종 및 발견 동물 매칭 서비스 및 제반 서비스(이하 "서비스")를 이용함에 있어, 회사와 회원의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.`,
      ],
    },
    {
      heading: "제 2 조 (용어의 정의)",
      body: [
        `1. "서비스"라 함은 구현되는 단말기(PC, 휴대형단말기 등의 각종 유무선 장치를 포함)와 상관없이 회원이 이용할 수 있는 For Mate 서비스를 의미합니다.`,
        `2. "회원"이라 함은 회사의 서비스에 접속하여 본 약관에 동의하고 서비스를 이용하는 고객을 말합니다.`,
      ],
    },
    {
      heading: "제 3 조 (약관의 개정과 효력)",
      body: [
        "회사는 관계 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있으며, 변경된 약관은 서비스 내 공지사항을 통해 회원에게 고지됩니다.",
      ],
    },
  ],
}

// 회원가입 페이지(SignupPage.jsx)의 체크박스와 신호를 주고받을 때 쓰는 key.
// 두 파일이 똑같은 문자열을 써야 하므로, 값 자체보다 "이 이름으로 통신한다"는 약속이 중요하다.
const AGREE_SIGNAL_KEY = "formate:agree-terms"

export default function TermsPage() {
  const navigate = useNavigate()

  // 화면에 들어오자마자 백엔드에 실제 약관 데이터를 요청한다.
  // → 이게 "백엔드와 연결"하는 부분이다. 다만 이 글을 쓰는 시점엔 백엔드(pages.controller.js)가
  //   아직 TODO라서 항상 실패(501)한다. 그래서 요청이 실패하거나 아직 응답이 오지 않은 동안에는
  //   위에 적어둔 FALLBACK_TERMS(피그마 원문)를 그대로 보여주고, 나중에 백엔드가 완성되면
  //   그 응답으로 자동 교체된다. 이렇게 하면 지금 당장 화면이 비어보이거나 에러만 뜨는 일 없이,
  //   피그마 디자인대로 항상 정상적으로 보이면서도 실제 API 연동 구조는 이미 갖춰진 상태가 된다.
  const { data } = useFetch(() => pagesApi.getTerms(), [])
  const terms = data || FALLBACK_TERMS

  // "내용을 모두 확인했습니다" 버튼을 눌렀을 때 실행된다.
  function handleConfirm() {
    // 회원가입 페이지에서 "약관보기"를 누르면 새 탭으로 이 페이지가 열린다(SignupPage.jsx 참고).
    // 즉 원래 있던 회원가입 탭은 화면에서 사라진 적이 없어서 입력값이 그대로 남아있다.
    // 여기서는 "이용약관에 동의했다"는 사실만 회원가입 탭에 알려주면 된다.
    //
    // localStorage는 같은 출처(origin)의 모든 탭이 공유하는 저장소이고, 가장 중요한 특징은
    // 값이 바뀌면 "그 값을 바꾼 탭 본인이 아니라 다른 탭"에서 storage 이벤트가 발생한다는 점이다.
    // 그래서 이 탭에서 값을 써주기만 하면, 회원가입 탭에서 그 변화를 감지해 체크박스를 자동으로 켤 수 있다.
    // (값 자체는 의미가 없고 "바뀌었다"는 신호만 필요해서 타임스탬프를 넣는다)
    localStorage.setItem(AGREE_SIGNAL_KEY, String(Date.now()))

    // 새 탭으로 열린 경우라면 이 탭을 닫아서, 사용자가 자연스럽게 원래 회원가입 탭으로 돌아가게 한다.
    // (스크립트로 연 탭이 아니면 브라우저가 닫기를 막는데, 그때는 그냥 아무 일도 일어나지 않는다)
    window.close()

    // 위 window.close()가 통하지 않는 경우(예: 주소를 직접 입력해서 들어온 경우)를 위한 대비책으로,
    // 같은 탭 안에서 회원가입 페이지로 이동시킨다. 새 탭이 성공적으로 닫혔다면 이 컴포넌트는 이미
    // 사라진 뒤라 아래 코드는 실행되지 않는다.
    navigate("/signup")
  }

  return (
    <div className="container auth-page">
      <div className="card card-padded auth-card">
        <div className="auth-card-header">
          <p className="auth-card-title">{terms.title}</p>
        </div>

        <div className="legal-sections">
          {terms.sections.map((section) => (
            <div className="legal-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {/* 피그마를 보면 한 조항의 본문이 여러 줄(예: 제2조의 "1. ..." / "2. ...")이어도
                  그 줄들은 서로 붙어서 줄바꿈만 되어 있을 뿐, 별도 문단처럼 떨어져 있지 않다.
                  그런데 .legal-section 자체가 gap을 쓰는 flex 컨테이너라, <p>들을 바로 자식으로 두면
                  형제 사이(제목-본문은 물론, 본문 줄과 줄 사이까지) 전부에 똑같은 간격이 생겨버린다.
                  그래서 본문 줄들을 별도 래퍼(.legal-section-body, flex가 아닌 일반 블록)로 한 번 더
                  감싸서, .legal-section의 flex gap이 "제목 - 본문 묶음" 사이에만 걸리게 만들었다. */}
              <div className="legal-section-body">
                {section.body.map((paragraph, index) => (
                  // 조항 번호(1./2. 등)까지 포함된 문장이라 key는 배열 인덱스를 그대로 쓴다.
                  // (문단 순서가 바뀔 일이 없는 정적 텍스트라 인덱스를 key로 써도 안전하다)
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
