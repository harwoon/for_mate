// 피그마: C-05 | 고객센터 (문의 등록)
// (C-05-O01 자주 묻는 질문 펼침 / C-05-O02 문의 유형 드롭다운 펼침 /
//  C-05-V01 문의 유형 미선택 / C-05-V02 제목 미입력 / C-05-V03 문의 내용 미입력 /
//  C-05-S01 문의 등록 성공 / C-05-E01 문의 등록 실패)
// https://www.figma.com/design/GtiPkMM5HvQyLBhhB0Aycs/중간프로젝트?node-id=0-1
//
// 참고 (오른쪽 칸 변경 이력): 처음엔 피그마 그대로 FAQ 3개를 하드코딩했다가, "실제로 내가
// 올린 문의가 보이게 해달라"는 요청으로 오른쪽 칸을 "내 문의 내역"(GET /inquiries)으로
// 바꿔봤다. 이번엔 다시 피그마의 FAQ 모양(C-05-O01)으로 되돌리되, 이번엔 텍스트를
// 하드코딩하지 않고 DB에서 가져오는 구조로 비워뒀다 — 지금은 백엔드에 FAQ 테이블/API가
// 없어서 목록이 항상 비어 있지만, faq.api.js의 getFaqs()만 실제 데이터를 내려주기
// 시작하면 이 컴포넌트는 손대지 않아도 바로 채워진다 (아래 "오른쪽: 자주 묻는 질문" 부분
// 주석 참고). "내 문의 내역" 기능 자체는 이번 요청에 따라 이 화면에서 제거했다.
//
// - 로그인 여부: 이 라우트(/support)는 App.jsx에서 더 이상 <ProtectedRoute> 안에 있지
//   않다. 비회원도 문의 작성 화면 자체는 볼 수 있어야 한다는 요청 때문이다 (App.jsx의
//   /support 라우트 주석 참고). 대신 실제 "문의 등록"(POST /inquiries)은 백엔드
//   inquiries.router.js가 여전히 requireAuth로 막고 있으므로, 로그인 여부를 확인하는
//   시점을 "페이지 진입"에서 "등록 버튼을 눌렀을 때"로 그대로 옮겨왔을 뿐이다.
//   (참고: 백엔드 auth.middleware.js에는 "비회원 요청도 통과시키되, 로그인해 있으면 그
//   사용자 정보만 실어준다"는 optionalAuth도 있다 — lost-posts/found-posts/rescue-animals의
//   상세 조회처럼 "누구나 보되 로그인 상태에 따라 내용이 달라지는" 화면에 쓰는 패턴이다.
//   문의 등록은 반드시 작성자(user_id)가 있어야 저장할 수 있는 액션이라 그 패턴을 그대로
//   가져다 쓸 수는 없지만, "비회원 요청을 막지 않고 일단 통과시킨 뒤 로그인 여부만 따로
//   확인한다"는 방향은 같다 — 여기서는 서버 미들웨어 대신 아래 handleSubmit()의 if (!user)
//   검사가 그 역할을 한다.)

import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext.jsx"
import * as inquiriesApi from "../../api/inquiries.api.js"
import * as faqApi from "../../api/faq.api.js"

// 문의 유형 7종. 피그마 C-05-O02(문의 유형 드롭다운 펼침)의 autocomplete-list에
// 나온 문구를 순서 그대로 옮겼다.
const INQUIRY_TYPES = [
  "AI 매칭 문의",
  "실종동물 문의",
  "발견 및 제보 문의",
  "계정 문의",
  "신고 문의",
  "서비스 이용 문의",
  "기타문의",
]

// FAQ 아코디언 화살표 아이콘(chevron-down).
// 피그마는 이 아이콘도 실제 svg 이미지 asset으로 내려주지만, 프로젝트 어디에도 Figma
// 아이콘 asset을 그대로 다운받아 쓰는 곳이 없다 (Header.jsx조차 종/사람 아이콘을 직접
// 그리지 않고 생략했었다 — AboutPage.jsx의 DatabaseIcon 주석 참고). 그 흐름을 그대로 따라
// 간단한 화살표 모양만 직접 SVG로 그려서 쓴다.
function ChevronDownIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// 폼 입력값의 초기값. 문의 등록에 성공하면 다시 이 값으로 되돌려 폼을 비운다.
const EMPTY_FORM = { type: "", title: "", content: "" }

export default function SupportPage() {
  const navigate = useNavigate()
  const location = useLocation() // 로그인 페이지로 보낼 때 "돌아올 주소"를 함께 넘기기 위해 필요하다
  const { user } = useAuth() // 비회원이면 null (AuthContext.jsx가 새로고침 시 getMe()로 채운다)

  const [form, setForm] = useState(EMPTY_FORM)

  // 필드별 오류 메시지. 피그마 C-05-V01/V02/V03의 문구를 그대로 사용한다.
  const [fieldErrors, setFieldErrors] = useState({ type: "", title: "", content: "" })

  const [submitting, setSubmitting] = useState(false)

  // 문의 등록 결과 모달. null이면 안 보이고, "success"/"error"면 각각
  // C-05-S01(등록 성공) / C-05-E01(등록 실패) 모달을 보여준다.
  const [resultModal, setResultModal] = useState(null)

  // 자주 묻는 질문 목록 (GET /faqs, faq.api.js).
  // null  = 아직 서버 응답을 받기 전(로딩 중)
  // []    = 응답은 받았지만 등록된 질문이 없음 — 지금은 백엔드에 이 API 자체가 없어서
  //         항상 이 상태가 된다 (faq.api.js 주석 참고). 나중에 백엔드가 완성되면 이
  //         컴포넌트 코드는 그대로 두고 실제 [{id, question, answer}, ...] 값이 채워진다.
  const [faqs, setFaqs] = useState(null)

  // 지금 펼쳐진 FAQ 항목들의 id 모음 (여러 개를 동시에 펼 수 있다). 문의 내역과 달리
  // FAQ는 목록을 받아올 때 질문/답변이 이미 다 들어있어서, 펼칠 때 따로 서버에 다시
  // 요청할 필요가 없다 — 그래서 로딩 상태 없이 단순히 열림/닫힘만 토글하면 된다.
  const [openFaqIds, setOpenFaqIds] = useState(() => new Set())

  function toggleFaq(id) {
    setOpenFaqIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 페이지에 처음 들어왔을 때 FAQ 목록을 한 번 불러온다.
  useEffect(() => {
    let cancelled = false // 응답이 오기 전에 컴포넌트가 사라져도 setState를 부르지 않기 위한 가드

    faqApi
      .getFaqs()
      .then((data) => {
        if (!cancelled) setFaqs(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        // 지금은 백엔드에 /faqs가 없어서 항상 이 경로를 탄다. 요청이 실패해도 화면이
        // 깨지지 않도록 "등록된 질문이 없음"과 같은 빈 배열로 처리해 둔다.
        if (!cancelled) setFaqs([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  // 입력 중에는 방금 수정한 필드의 오류 메시지만 지운다 (LoginPage.jsx와 같은 방식).
  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  // 제출 시점에 세 필드를 검사한다. 백엔드 inquiries.service.js가 검사하는 순서(문의 유형 →
  // 제목 → 내용)와 오류 문구를 그대로 맞춰서, 프론트에서 먼저 걸러지든 백엔드에서 걸러지든
  // 사용자에게는 같은 메시지가 보이게 했다.
  function validate() {
    const nextErrors = { type: "", title: "", content: "" }

    if (!form.type) {
      nextErrors.type = "문의 유형을 선택해 주세요." // C-05-V01
    }
    if (!form.title.trim()) {
      nextErrors.title = "제목을 입력해 주세요." // C-05-V02
    }
    if (!form.content.trim()) {
      nextErrors.content = "문의 내용을 입력해 주세요." // C-05-V03
    }

    setFieldErrors(nextErrors)
    return !nextErrors.type && !nextErrors.title && !nextErrors.content
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!validate()) return

    // 비회원 처리: 필드 검사까지는 로그인 여부와 상관없이 똑같이 통과시킨다 — "글을 다
    // 쓰고 마지막 등록 버튼을 눌렀을 때"에야 로그인이 필요하다는 걸 알려달라는 요청이라,
    // 여기서 검사 순서를 "필드 검사 → 로그인 검사"로 둔 것도 그 요청을 그대로 따른 것이다
    // (처음부터 막아버리면 비회원은 아예 써보지도 못하고 쫓겨나는 느낌을 준다).
    // 로그인 페이지는 ProtectedRoute.jsx가 원래 하던 것과 똑같이 <Navigate to="/login" />로
    // 보내는 것과 동일한 결과가 되도록 navigate("/login")을 그대로 사용한다.
    //
    // state: { from: location.pathname } — 로그인을 마치고 나면 로그인 페이지가 항상
    // 홈("/")이 아니라 지금 이 고객센터 페이지로 돌아오게 하려면 "어디서 왔는지"를
    // 로그인 페이지에 같이 알려줘야 한다. ProtectedRoute.jsx가 다른 보호된 페이지에서
    // 로그인으로 보낼 때도 똑같은 방식(state.from)을 쓰므로, LoginPage.jsx는 이 페이지
    // 전용 코드 없이 한 가지 방식으로 두 경우를 모두 처리한다.
    if (!user) {
      navigate("/login", { state: { from: location.pathname } })
      return
    }

    setSubmitting(true)
    try {
      // inquiries.api.js: 문의 등록(POST /inquiries)은 이 화면의 핵심 기능이라 FAQ 영역과
      // 무관하게 그대로 유지한다. (내 문의 목록을 이 화면에 다시 보여주는 기능만 이번
      // 요청으로 제거했을 뿐, 등록 자체는 계속 실제 백엔드로 저장된다)
      await inquiriesApi.createInquiry({
        type: form.type,
        title: form.title.trim(),
        content: form.content.trim(),
      })
      setForm(EMPTY_FORM) // 등록 성공: 다음에 또 문의할 수 있도록 폼을 비워둔다.
      setResultModal("success") // C-05-S01
    } catch (error) {
      // 바로 위에서 user를 확인했는데도 여기서 401(UNAUTHORIZED)이 온다면, 폼을 채우는
      // 사이에 로그인 세션(쿠키/토큰)이 만료됐다는 뜻이다. 이때도 "문의 등록 실패"(E01)
      // 대신 로그인 페이지로 보내는 게 사용자에게 더 정확한 안내다.
      if (error.status === 401) {
        navigate("/login", { state: { from: location.pathname } })
        return
      }
      // 그 외의 실패는 입력했던 내용을 그대로 남겨서 다시 시도하기 편하게 한다.
      setResultModal("error") // C-05-E01
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">고객센터 문의</h1>
        <p className="page-desc">서비스 불편사항이나 건의사항을 남겨주시면 신속하게 답변해 드리겠습니다.</p>
      </div>

      <div className="support-grid">
        {/* 왼쪽: 문의 작성 폼 */}
        <div className="card card-padded">
          <div className="auth-card-header">
            <h2 className="auth-card-title">문의 작성</h2>
            <p className="text-sub">아래 항목을 작성해 주시면 담당자가 확인 후 답변을 드립니다.</p>
          </div>

          <form className="stack" onSubmit={handleSubmit} noValidate>
            {/* 문의 유형: 피그마는 커스텀 드롭다운(자체 목록 오버레이, C-05-O02)이지만,
                프로젝트 어디에도 그런 커스텀 드롭다운 컴포넌트가 없다(로그인/회원가입 폼도
                전부 일반 input일 뿐이다). 이 화면 하나만을 위해 새로 만들면 오히려 프로젝트
                전체 스타일과 따로 노는 요소가 되므로, 이미 있는 .form-select(일반 <select>)를
                그대로 쓰고 옵션 7개만 피그마 값 그대로 채워 넣었다. 처음엔 아무것도 선택되지
                않은 상태여야 C-05-V01(미선택 오류)이 실제로 발생할 수 있어서, 빈 문자열을
                가리키는 비활성 placeholder 옵션을 맨 위에 둔다. */}
            <div className="form-field">
              <label className="form-label" htmlFor="inquiry-type">문의 유형</label>
              <select
                id="inquiry-type"
                className={`form-select${fieldErrors.type ? " is-error" : ""}`}
                value={form.type}
                onChange={(event) => handleChange("type", event.target.value)}
              >
                <option value="" disabled>문의 유형을 선택해 주세요</option>
                {INQUIRY_TYPES.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              {fieldErrors.type && <p className="form-error">{fieldErrors.type}</p>}
            </div>

            {/* 제목 */}
            <div className="form-field">
              <label className="form-label" htmlFor="inquiry-title">제목</label>
              <input
                id="inquiry-title"
                type="text"
                className={`form-input${fieldErrors.title ? " is-error" : ""}`}
                placeholder="제목을 입력해 주세요"
                value={form.title}
                onChange={(event) => handleChange("title", event.target.value)}
                maxLength={200} // 백엔드 inquiries.service.js의 TITLE_MAX_LENGTH와 동일
              />
              {fieldErrors.title && <p className="form-error">{fieldErrors.title}</p>}
            </div>

            {/* 문의 내용: 피그마는 다른 입력칸과 똑같이 48px짜리 한 줄 박스로 그려져 있지만,
                실제 안내 문구가 "자세히 적어주세요"인 만큼 조금만 길게 써도 한 줄 input으로는
                앞부분이 가려져 보이지 않는다. 그래서 이 필드만 여러 줄을 입력할 수 있는
                .form-textarea로 만들었다 (라벨/placeholder 문구는 피그마 원문 그대로 유지 —
                백엔드도 내용 길이에는 별도 제한(TITLE_MAX_LENGTH 같은 상수)을 두지 않는다). */}
            <div className="form-field">
              <label className="form-label" htmlFor="inquiry-content">문의 내용</label>
              <textarea
                id="inquiry-content"
                className={`form-textarea${fieldErrors.content ? " is-error" : ""}`}
                placeholder="서비스 불편사항이나 건의사항을 자세히 적어주세요. 신속하게 답변해 드리겠습니다."
                value={form.content}
                onChange={(event) => handleChange("content", event.target.value)}
              />
              {fieldErrors.content && <p className="form-error">{fieldErrors.content}</p>}
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? "등록 중..." : "문의 등록"}
            </button>
          </form>
        </div>

        {/* 오른쪽: 자주 묻는 질문 (피그마 C-05-O01, 아코디언).
            질문/답변 텍스트는 더 이상 이 파일에 하드코딩하지 않는다 — faq.api.js의
            getFaqs()가 나중에 실제 DB 내용을 내려주면 그 값을 그대로 map()해서 보여주는
            구조만 미리 만들어 뒀다. 지금은 백엔드에 그 API가 아직 없어서(faq.api.js 주석
            참고) faqs가 항상 빈 배열이 되고, 그래서 항상 "등록된 자주 묻는 질문이
            없습니다."만 보인다 — 이건 버그가 아니라 DB에 실제 FAQ가 아직 없다는 뜻이다. */}
        <div className="card card-padded">
          <div className="auth-card-header">
            <h2 className="auth-card-title">자주 묻는 질문</h2>
            <p className="text-sub">빠른 해결을 위해 FAQ를 먼저 확인해 주세요.</p>
          </div>

          {faqs === null && <div className="state-box">불러오는 중...</div>}

          {faqs !== null && faqs.length === 0 && (
            <div className="state-box">등록된 자주 묻는 질문이 없습니다.</div>
          )}

          {faqs !== null && faqs.length > 0 && (
            <div className="accordion-list">
              {faqs.map((item, index) => {
                const faqId = item.id ?? index
                const isOpen = openFaqIds.has(faqId)
                return (
                  <div className="accordion-item" key={faqId}>
                    <button
                      type="button"
                      className="accordion-row"
                      onClick={() => toggleFaq(faqId)}
                      aria-expanded={isOpen}
                    >
                      <span className="accordion-title">{item.question}</span>
                      <ChevronDownIcon className={`row-chevron${isOpen ? " is-open" : ""}`} />
                    </button>
                    {isOpen && <p className="accordion-answer">{item.answer}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 문의 등록 성공/실패 모달 (C-05-S01 / C-05-E01).
          로그인 성공 모달(LoginPage.jsx, C-01-S01)과 카드 모양이 완전히 같아서(흰 배경,
          테두리, radius, 세로 가운데 정렬, 아래 초록 버튼 하나) 그때 만든
          .auth-success-card / .auth-success-title을 그대로 재사용했다 — 클래스 이름은
          "auth"지만 실제로는 "가운데 정렬된 결과 안내 모달" 공통 스타일이라 문의 등록
          결과에도 그대로 어울린다. 성공/실패 모두 같은 모양이고 텍스트와 버튼 동작만
          다르므로(성공은 폼이 이미 비워진 채로 닫히고, 실패는 입력값이 남은 채로 닫혀서
          바로 다시 시도할 수 있다) 버튼은 둘 다 모달을 닫기만 하면 된다. */}
      {resultModal && (
        <div className="modal-backdrop">
          <div className="auth-success-card">
            {resultModal === "success" ? (
              <>
                <p className="auth-success-title">문의가 등록되었습니다.</p>
                <p className="text-sub">담당자가 확인 후 답변드리겠습니다.</p>
              </>
            ) : (
              <>
                <p className="auth-success-title">문의 등록에 실패했습니다.</p>
                <p className="text-sub">잠시 후 다시 시도해 주세요.</p>
              </>
            )}
            <button className="btn btn-primary btn-block" onClick={() => setResultModal(null)}>
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
