// 피그마: C-01 로그인
// (C-01-V01 이메일 미입력 / C-01-V02 이메일 형식 오류 / C-01-V03 비밀번호 미입력 / C-01-S01 로그인 성공)
// https://www.figma.com/design/GtiPkMM5HvQyLBhhB0Aycs/중간프로젝트?node-id=0-1
//
// 기능 (피그마 "화면 설명 | C-01" 문서 그대로)
// - 이메일 입력: 가입된 계정의 이메일을 입력한다.
// - 비밀번호 입력: 가입된 계정의 비밀번호를 입력한다.
// - 로그인: 입력한 이메일과 비밀번호를 확인하여 로그인을 진행한다.
// - 회원가입 이동: 계정이 없는 사용자는 회원가입 페이지로 이동할 수 있다.
//
// - 구글/카카오 로그인: 입력 박스 하단의 버튼을 누르면 백엔드가 각 서비스로 리다이렉트하고,
//   로그인이 끝나면 백엔드가 다시 프론트로 돌려보낸다 (auth.api.js의 goGoogleLogin/goKakaoLogin).
//
// 참고: 피그마 C-01 화면 자체에는 "아이디 / 비밀번호 찾기" 링크 레이어가 아직 hidden 처리되어
// 있어(디자인 미확정) 이번 화면에는 넣지 않았다. 디자인이 확정되면 링크만 추가하면 된다.

import { useState } from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext.jsx"
import { goGoogleLogin, goKakaoLogin } from "../../api/auth.api.js"

// 이메일 형식 검사용 정규식.
// 백엔드 Server/src/modules/auth/auth.service.js 의 EMAIL_REGEX와 동일한 규칙을 사용한다.
// (local부분 + "@" + domain + "." + TLD(2자 이상), 공백 불가)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, login } = useAuth()

  // 입력값
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // 필드별 오류 메시지. 비어 있으면 정상 상태.
  // - fieldErrors.email    → C-01-V01(이메일 미입력) / C-01-V02(이메일 형식 오류)
  // - fieldErrors.password → C-01-V03(비밀번호 미입력)
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "" })

  // 입력값 형식은 맞지만 로그인 자체가 실패했을 때의 메시지 (아이디/비밀번호 불일치 등)
  const [submitError, setSubmitError] = useState("")

  // 로그인 버튼 중복 클릭(중복 요청) 방지용
  const [submitting, setSubmitting] = useState(false)

  // 로그인 성공 모달 노출 여부 (C-01-S01)
  const [showSuccess, setShowSuccess] = useState(false)

  // 이미 로그인되어 있는 사용자가 로그인 페이지로 들어오면 홈으로 돌려보낸다.
  // (AuthContext가 새로고침 시 getMe()로 로그인 여부를 확인해 채워주는 값)
  if (user) return <Navigate to="/" replace />

  // 제출 시점에 이메일/비밀번호를 검사해서 필드별 오류 메시지를 만든다.
  // 문제가 없는 필드는 빈 문자열을 넣는다.
  function validate() {
    const nextErrors = { email: "", password: "" }

    if (!email.trim()) {
      nextErrors.email = "이메일을 입력해 주세요." // C-01-V01
    } else if (!EMAIL_REGEX.test(email.trim())) {
      nextErrors.email = "올바른 이메일 주소를 입력해 주세요." // C-01-V02
    }

    if (!password) {
      nextErrors.password = "비밀번호를 입력해 주세요." // C-01-V03
    }

    setFieldErrors(nextErrors)
    return !nextErrors.email && !nextErrors.password
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError("")

    // 유효성 검사에 걸리면 백엔드에 요청을 보내지 않고 여기서 멈춘다.
    if (!validate()) return

    setSubmitting(true)
    try {
      // AuthContext.login()이 내부적으로 auth.api.js의 login() → 백엔드 POST /auth/login을 호출하고,
      // 성공하면 로그인 쿠키(refresh_token)가 세팅되면서 user 상태가 앱 전체에 반영된다.
      await login({ email: email.trim(), password })
      setShowSuccess(true) // C-01-S01: 로그인 성공 모달 노출
    } catch (error) {
      // 백엔드 공통 에러 형식 { success:false, error:{ code, message } }을
      // api/client.js가 이미 Error(message)로 바꿔서 던져준다.
      // 예: code "LOGIN_FAILED" → "이메일 또는 비밀번호가 올바르지 않습니다."
      setSubmitError(error.message || "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setSubmitting(false)
    }
  }

  // 입력 중에는 방금 수정한 필드의 오류 메시지만 지운다.
  // (다음 제출 전까지 이전 오류 문구가 그대로 남아있지 않도록)
  function handleChange(field, value) {
    if (field === "email") setEmail(value)
    else setPassword(value)

    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: "" }))
    }
    if (submitError) setSubmitError("")
  }

  // 성공 모달의 "메인으로" 버튼 클릭 시 홈으로 이동
  function goHome() {
    navigate("/")
  }

  return (
    <div className="container auth-page">
      <div className="card card-padded auth-card">
        {/* intro-block: 서비스 로고 + 소개 문구 */}
        <div className="auth-intro">
          <Link to="/" className="auth-logo">
            <span className="auth-logo-dot" />
            For Mate
          </Link>
          <p className="text-sub">다시 가족을 만날 수 있도록</p>
        </div>

        <form className="stack" onSubmit={handleSubmit} noValidate>
          {/* 이메일 입력 */}
          <div className="form-field">
            <label className="form-label" htmlFor="login-email">이메일</label>
            <input
              id="login-email"
              type="email"
              className={`form-input${fieldErrors.email ? " is-error" : ""}`}
              placeholder="formate@example.com"
              value={email}
              onChange={(event) => handleChange("email", event.target.value)}
              autoComplete="email"
            />
            {fieldErrors.email && <p className="form-error">{fieldErrors.email}</p>}
          </div>

          {/* 비밀번호 입력 */}
          <div className="form-field">
            <label className="form-label" htmlFor="login-password">비밀번호</label>
            <input
              id="login-password"
              type="password"
              className={`form-input${fieldErrors.password ? " is-error" : ""}`}
              placeholder="password"
              value={password}
              onChange={(event) => handleChange("password", event.target.value)}
              autoComplete="current-password"
            />
            {fieldErrors.password && <p className="form-error">{fieldErrors.password}</p>}
          </div>

          {/* 이메일/비밀번호 형식은 맞지만 로그인 자체가 실패한 경우 (예: 이메일 또는 비밀번호 불일치) */}
          {submitError && <p className="alert alert-error">{submitError}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>

        {/* 구글/카카오 로그인: 버튼을 누르면 백엔드가 리다이렉트로 처리하고 끝나면 다시 이 앱으로 돌아온다 */}
        <div className="auth-divider">또는</div>
        <div className="auth-socials">
          <button type="button" className="btn btn-google btn-block" onClick={goGoogleLogin}>
            Google로 로그인
          </button>
          <button type="button" className="btn btn-kakao btn-block" onClick={goKakaoLogin}>
            카카오로 로그인
          </button>
        </div>

        {/* 회원가입 이동 */}
        <p className="auth-links">
          <span className="text-sub">계정이 없으신가요?</span>
          <Link to="/signup">회원가입</Link>
        </p>
      </div>

      {/* 로그인 성공 모달 (C-01-S01) */}
      {showSuccess && (
        <div className="modal-backdrop">
          <div className="auth-success-card">
            <p className="auth-success-title">로그인에 성공했습니다.</p>
            <p className="text-sub">For Mate와 함께 가족을 찾아주세요.</p>
            <button className="btn btn-primary btn-block" onClick={goHome}>메인으로</button>
          </div>
        </div>
      )}
    </div>
  )
}
