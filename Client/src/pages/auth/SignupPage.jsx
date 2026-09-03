// 피그마: C-02 회원가입
// (C-02-V01 이름 미입력 / C-02-V02 이메일 미입력 / C-02-V03 이메일 형식 오류 /
//  C-02-V04 이미 가입된 이메일 / C-02-V05 비밀번호 조건 불충족 / C-02-V06 비밀번호 확인 불일치 /
//  C-02-V07 서비스 이용약관 미동의 / C-02-V08 개인정보 수집 미동의)
// https://www.figma.com/design/GtiPkMM5HvQyLBhhB0Aycs/중간프로젝트?node-id=0-1
//
// 기능 (피그마 "화면 설명 | C-02" 문서 그대로)
// - 회원 정보 입력: 이름과 이메일을 입력하고, 비밀번호는 영문·숫자를 포함한 8자 이상으로 입력한다.
// - 비밀번호 확인: 비밀번호를 한 번 더 입력해서 앞서 입력한 값과 일치하는지 확인한다.
// - 약관 동의: 서비스 이용약관 / 개인정보 수집·이용 동의 등 필수 항목에 동의한다.
// - 약관 확인: "약관보기"를 누르면 이용약관/개인정보처리방침 페이지로 이동해서 내용을 볼 수 있다.
// - 회원가입: 입력값과 필수 약관 동의 여부를 확인한 뒤 계정을 생성한다.
//
// 참고(TermsPage.jsx / PrivacyPage.jsx와 연결되는 부분):
// 위 두 링크는 새 탭으로 열리기 때문에(target="_blank") 이 회원가입 탭은 계속 남아있고,
// 입력하던 값도 그대로 유지된다. 새 탭에서 "내용을 모두 확인했습니다"를 누르면 그 탭이
// localStorage에 신호를 남기고 닫히는데, 아래 useEffect가 그 신호를 감지해서 해당 체크박스를
// 자동으로 체크해준다. -> 피그마 설명의 "회원가입 페이지로 돌아가면 ... 동의 상태가 반영된다"를
// 구현한 부분이다.
//


import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import * as authApi from "../../api/auth.api.js"

// 이메일 형식 검사용 정규식.
// LoginPage.jsx / 백엔드 auth.service.js의 EMAIL_REGEX와 동일한 규칙(local@domain.tld, 공백 불가)을 쓴다.
// → 프론트에서 먼저 걸러주면 굳이 서버까지 요청을 보내지 않아도 되니 응답이 더 빠르게 느껴진다.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// 비밀번호 형식 검사용 정규식.
// 피그마 C-02-V05 화면에 적힌 문구("영문과 숫자를 포함해 8자 이상")를 그대로 규칙으로 옮긴 것이다.
// (?=.*[A-Za-z]) → 영문자가 최소 1개 있어야 함 (앞을 미리 살펴보기만 하고 실제로 소비하지 않는 lookahead)
// (?=.*\d)       → 숫자가 최소 1개 있어야 함
// .{8,}          → 전체 길이는 8자 이상
// 참고: 백엔드(auth.service.js)는 길이(8~72자)만 검사하므로, 프론트가 이보다 엄격한 규칙으로
// 한 번 더 걸러주면 사용자에게 더 친절한 안내를 미리 보여줄 수 있다.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

export default function SignupPage() {
  const navigate = useNavigate()

  // 입력값들을 필드마다 따로 두지 않고 객체 하나로 묶어서 관리한다.
  // → 입력 필드가 4개나 되기 때문에, useState를 4번 따로 쓰는 것보다
  //   handleChange 함수 하나로 모든 필드를 처리할 수 있어 코드가 짧아진다.
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
  })

  // 약관 동의 체크박스 2개도 별도 state로 관리한다. (C-02-V07, C-02-V08)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)

  // 필드별 오류 메시지. 값이 있으면 그 필드 아래에 빨간 글씨로 표시된다.
  // consent 하나로 묶은 이유: 피그마 디자인에서도 두 체크박스를 감싸는 박스 하나에
  // 오류 문구 한 줄만 표시하기 때문에(V07/V08), 두 체크박스의 오류를 하나의 슬롯에 담는다.
  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    email: "",
    password: "",
    passwordConfirm: "",
    consent: "",
  })

  // 필드 유효성 검사는 통과했지만 회원가입 자체가 실패했을 때 보여줄 공통 오류 메시지
  // (예: 서버 통신 오류, 필수값 누락처럼 특정 필드에 딱 맞아떨어지지 않는 경우)
  const [submitError, setSubmitError] = useState("")

  // 회원가입 버튼 중복 클릭 방지용
  const [submitting, setSubmitting] = useState(false)

  // 회원가입 완료 후 안내 화면 노출 여부.
  // 피그마에는 회원가입 성공 전용 프레임이 따로 없지만, 로그인 페이지의 "로그인 성공" 모달과
  // 같은 방식(카드 + 버튼으로 다음 행동 안내)을 재사용해서 사용자에게 다음 단계를 알려준다.
  const [showSuccess, setShowSuccess] = useState(false)

  // TermsPage.jsx / PrivacyPage.jsx가 새 탭에서 "내용을 모두 확인했습니다"를 누르면
  // localStorage에 값을 써준다. storage 이벤트는 "값을 바꾼 탭 자신"에는 발생하지 않고
  // "다른" 탭에서만 발생하기 때문에, 여기(회원가입 탭)에서만 이 이벤트를 받게 된다.
  // -> 사용자가 직접 체크하지 않아도, 약관을 다 읽고 왔다는 사실만으로 자동 체크되는 원리다.
  useEffect(() => {
    function handleAgreeSignal(event) {
      if (event.key === "formate:agree-terms") {
        setAgreeTerms(true)
        localStorage.removeItem(event.key) // 신호는 한 번 쓰고 나면 정리해서 다음 방문에 영향 없게 한다
      }
      if (event.key === "formate:agree-privacy") {
        setAgreePrivacy(true)
        localStorage.removeItem(event.key)
      }
    }

    window.addEventListener("storage", handleAgreeSignal)
    // 컴포넌트가 사라질 때는 반드시 리스너도 같이 정리해야 메모리 누수와 중복 등록을 막을 수 있다.
    return () => window.removeEventListener("storage", handleAgreeSignal)
  }, [])

  // input의 name 속성값을 그대로 key로 써서 form 객체의 해당 필드만 갱신한다.
  // → 필드가 늘어나도 이 함수 하나만 유지하면 되는 게 핵심 원리다.
  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))

    // 방금 수정한 필드의 오류만 지운다. (한 번에 다 지우면 아직 안 고친 다른 필드의
    // 오류 문구까지 사라져서, 사용자가 "그 필드는 이제 괜찮은가?" 착각할 수 있다)
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: "" }))
    }
    if (submitError) setSubmitError("")
  }

  // 체크박스 두 개는 각각 별도 핸들러로 토글하고, 체크하는 순간 consent 오류를 지운다.
  function toggleTerms() {
    setAgreeTerms((prev) => !prev)
    if (fieldErrors.consent) setFieldErrors((prev) => ({ ...prev, consent: "" }))
  }

  function togglePrivacy() {
    setAgreePrivacy((prev) => !prev)
    if (fieldErrors.consent) setFieldErrors((prev) => ({ ...prev, consent: "" }))
  }

  // 제출 시점에 모든 입력값을 검사해서 필드별 오류 메시지를 만든다.
  // 하나의 함수에서 한 번에 검사하는 이유: 회원가입은 "모든 조건을 동시에 만족해야" 계정이
  // 만들어지므로, 이름을 고치자마자 바로 요청을 보내는 것보다 제출 버튼을 눌렀을 때 한꺼번에
  // 확인하는 편이 사용자 입장에서 자연스럽고 서버에 불필요한 요청도 줄어든다.
  function validate() {
    const next = { name: "", email: "", password: "", passwordConfirm: "", consent: "" }

    if (!form.name.trim()) {
      next.name = "이름을 입력해 주세요." // C-02-V01
    }

    if (!form.email.trim()) {
      next.email = "이메일을 입력해 주세요." // C-02-V02
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      next.email = "올바른 이메일 주소를 입력해 주세요." // C-02-V03
    }
    // C-02-V04(이미 가입된 이메일)는 프론트에서 미리 알 수 없다.
    // 실제로 가입돼 있는지는 백엔드 DB를 조회해야 알 수 있으므로, 이 오류는
    // handleSubmit의 catch 블록에서 서버 응답을 받은 뒤에 채워 넣는다.

    if (!PASSWORD_REGEX.test(form.password)) {
      next.password = "영문과 숫자를 포함해 8자 이상 입력해 주세요." // C-02-V05
    }

    // 비밀번호 확인은 "비밀번호와 똑같은 값을 한 번 더 입력했는가"만 확인하면 되므로
    // 비어있는 경우도 자연스럽게 "일치하지 않음"으로 처리된다. (별도의 "미입력" 문구가
    // 피그마에 없기 때문에 이렇게 하나로 합쳐서 처리하는 게 디자인과도 맞는다)
    if (form.passwordConfirm !== form.password) {
      next.passwordConfirm = "비밀번호가 일치하지 않습니다." // C-02-V06
    }

    // 약관 동의는 피그마 디자인대로 한 번에 한 문구만 보여준다.
    // 이용약관 → 개인정보 순서로 검사해서, 이용약관에 동의 안 했으면 그 메시지부터 보여준다.
    if (!agreeTerms) {
      next.consent = "서비스 이용약관에 동의해 주세요." // C-02-V07
    } else if (!agreePrivacy) {
      next.consent = "개인정보 수집 및 이용에 동의해 주세요." // C-02-V08
    }

    setFieldErrors(next)

    // 모든 값이 빈 문자열이어야 통과. Object.values로 순회하면 필드가 늘어나도
    // 이 판정 로직은 그대로 재사용할 수 있다.
    return Object.values(next).every((message) => message === "")
  }

  async function handleSubmit(event) {
    event.preventDefault() // 브라우저의 기본 폼 제출(새로고침)을 막고, 우리가 만든 로직으로 대신 처리한다.
    setSubmitError("")

    if (!validate()) return // 유효성 검사에서 걸리면 서버에 요청을 보내지 않고 여기서 멈춘다.

    setSubmitting(true)
    try {
      // 로그인과 달리 회원가입은 AuthContext를 거치지 않고 auth.api.js를 직접 호출한다.
      // 이유: 회원가입 성공은 "계정이 생성됐다"는 의미일 뿐 로그인 상태가 되는 것은 아니기 때문이다.
      // (실제로 백엔드 auth.service.js의 signup()도 로그인 쿠키를 세팅하지 않는다.
      //  로그인 쿠키는 login()에서만 만들어진다.)
      await authApi.signup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      })
      setShowSuccess(true)
    } catch (error) {
      // 백엔드 공통 에러 형식 { success:false, error:{ code, message } }을
      // api/client.js가 이미 Error(message) + error.code 형태로 바꿔서 던져준다.
      if (error.code === "DUPLICATE_EMAIL") {
        // C-02-V04: 이미 가입된 이메일 → 이메일 입력칸 바로 아래에 표시한다.
        setFieldErrors((prev) => ({
          ...prev,
          email: "이미 가입된 이메일입니다. 로그인해 주세요.",
        }))
      } else {
        // 그 외(MISSING_FIELD, 네트워크 오류 등)는 특정 입력칸 문제가 아니므로
        // 폼 하단에 공통 오류 배너로 보여준다.
        setSubmitError(error.message || "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container auth-page">
      <div className="card card-padded auth-card">
        {/* card-header: 타이틀 + 소개 문구. 로그인 카드(auth-intro)는 가운데 정렬이지만
            회원가입 카드는 피그마 디자인상 왼쪽 정렬이라 별도 클래스(auth-card-header)를 쓴다. */}
        <div className="auth-card-header">
          <p className="auth-card-title">회원가입</p>
          <p className="text-sub">잃어버린 내 가족 찾기 시작하기</p>
        </div>

        <form className="stack" onSubmit={handleSubmit} noValidate>
          {/* 이름 입력 */}
          <div className="form-field">
            <label className="form-label" htmlFor="signup-name">이름</label>
            <input
              id="signup-name"
              name="name"
              type="text"
              className={`form-input${fieldErrors.name ? " is-error" : ""}`}
              placeholder="이름을 입력해 주세요"
              value={form.name}
              onChange={handleChange}
              autoComplete="name"
            />
            {fieldErrors.name && <p className="form-error">{fieldErrors.name}</p>}
          </div>

          {/* 이메일 입력 */}
          <div className="form-field">
            <label className="form-label" htmlFor="signup-email">이메일 주소</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              className={`form-input${fieldErrors.email ? " is-error" : ""}`}
              placeholder="yourmail@domain.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
            />
            {fieldErrors.email && <p className="form-error">{fieldErrors.email}</p>}
          </div>

          {/* 비밀번호 입력 */}
          <div className="form-field">
            <label className="form-label" htmlFor="signup-password">비밀번호</label>
            <input
              id="signup-password"
              name="password"
              type="password"
              className={`form-input${fieldErrors.password ? " is-error" : ""}`}
              placeholder="영문, 숫자 포함 8자 이상"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
            />
            {fieldErrors.password && <p className="form-error">{fieldErrors.password}</p>}
          </div>

          {/* 비밀번호 확인 */}
          <div className="form-field">
            <label className="form-label" htmlFor="signup-password-confirm">비밀번호 확인</label>
            <input
              id="signup-password-confirm"
              name="passwordConfirm"
              type="password"
              className={`form-input${fieldErrors.passwordConfirm ? " is-error" : ""}`}
              placeholder="비밀번호를 한번 더 입력해 주세요"
              value={form.passwordConfirm}
              onChange={handleChange}
              autoComplete="new-password"
            />
            {fieldErrors.passwordConfirm && <p className="form-error">{fieldErrors.passwordConfirm}</p>}
          </div>

          {/* 약관 동의: 체크박스 자체는 label로 감싸서 텍스트를 눌러도 토글되게 하고,
              "약관보기"는 label 바깥의 별도 링크로 둬서 눌렀을 때 체크박스가 같이
              토글되지 않도록(이벤트가 겹치지 않도록) 분리했다. */}
          <div className={`auth-consent-box${fieldErrors.consent ? " is-error" : ""}`}>
            <div className="auth-consent-item">
              <label>
                <input type="checkbox" checked={agreeTerms} onChange={toggleTerms} />
                [필수] 서비스 이용약관 동의
              </label>
              {/* 새 탭에서 열어서, 작성 중이던 회원가입 입력값이 사라지지 않게 한다.
                  주소를 /pages/terms가 아니라 /terms로 쓰는 이유: vite.config.js의 proxy가
                  "/pages"로 시작하는 요청을 전부 백엔드(4000)로 넘겨버려서, /pages/terms로 새 탭을
                  열면 화면 대신 백엔드가 주는 raw JSON이 보여버린다. (App.jsx 주석 참고) */}
              <Link to="/terms" target="_blank" rel="noreferrer">약관보기</Link>
            </div>
            <div className="auth-consent-item">
              <label>
                <input type="checkbox" checked={agreePrivacy} onChange={togglePrivacy} />
                [필수] 개인정보 수집 및 이용 동의
              </label>
              <Link to="/privacy" target="_blank" rel="noreferrer">약관보기</Link>
            </div>
          </div>
          {fieldErrors.consent && <p className="form-error">{fieldErrors.consent}</p>}

          {/* 필드 문제는 아니지만 회원가입 자체가 실패한 경우 */}
          {submitError && <p className="alert alert-error">{submitError}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "가입 처리 중..." : "회원가입 완료"}
          </button>
        </form>
      </div>

      {/* 회원가입 완료 안내. 로그인 페이지의 성공 모달과 같은 스타일을 재사용한다. */}
      {showSuccess && (
        <div className="modal-backdrop">
          <div className="auth-success-card">
            <p className="auth-success-title">회원가입이 완료되었습니다.</p>
            <p className="text-sub">로그인하고 For Mate를 시작해 보세요.</p>
            <button className="btn btn-primary btn-block" onClick={() => navigate("/login")}>
              로그인하러 가기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
