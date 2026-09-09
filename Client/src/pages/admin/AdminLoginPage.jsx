import { useState } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext.jsx"

export default function AdminLoginPage() {
    const { user, login, logout } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [submitting, setSubmitting] = useState(false)

    if (user?.is_admin === true) return <Navigate to="/admin" replace />

    async function handleSubmit(event) {
        event.preventDefault()
        setError("")
        setSubmitting(true)

        try {
            const loggedInUser = await login({ email: email.trim(), password })
            if (loggedInUser?.is_admin !== true) {
                await logout()
                setError("관리자 계정으로만 로그인할 수 있습니다.")
                return
            }

            navigate(location.state?.from || "/admin", { replace: true })
        } catch (submitError) {
            setError(submitError.message || "관리자 로그인에 실패했습니다.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="admin-login-page">
            <div className="admin-login-panel">
                <Link to="/" className="admin-login-brand"><span className="admin-brand-mark"><i className="ri-shield-check-line" aria-hidden="true" /></span>For Mate</Link>
                <div className="admin-login-heading">
                    <p className="admin-header-eyebrow">For Mate 운영센터</p>
                    <h1>관리자 로그인</h1>
                    <p>관리자 계정으로 로그인해주세요.</p>
                </div>

                <form className="admin-login-form" onSubmit={handleSubmit}>
                    <label htmlFor="admin-email">아이디 또는 이메일</label>
                    <input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
                    <label htmlFor="admin-password">비밀번호</label>
                    <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                    {error && <p className="alert alert-error">{error}</p>}
                    <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>{submitting ? "로그인 중..." : "관리자 로그인"}</button>
                </form>
                <Link to="/" className="admin-login-back"><i className="ri-arrow-left-line" aria-hidden="true" />일반 서비스로 돌아가기</Link>
            </div>
        </div>
    )
}
