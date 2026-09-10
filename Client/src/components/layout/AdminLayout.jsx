import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "../../context/AuthContext.jsx"

const MENU_ITEMS = [
    { to: "/admin", label: "대시보드", icon: "ri-dashboard-line", end: true },
    { to: "/admin/lost-posts", label: "실종 공고", icon: "ri-search-eye-line" },
    { to: "/admin/found-posts", label: "발견제보", icon: "ri-file-list-3-line" },
    { to: "/admin/reports", label: "신고 관리", icon: "ri-alarm-warning-line" },
    { to: "/admin/inquiries", label: "문의 관리", icon: "ri-question-answer-line" },
    { to: "/admin/matches", label: "AI 매칭 관리", icon: "ri-sparkling-2-line" },
    { to: "/admin/faqs", label: "FAQ 관리", icon: "ri-questionnaire-line" }
]

export default function AdminLayout() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const currentItem = MENU_ITEMS.find((item) => (
        item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
    ))

    async function handleLogout() {
        try {
            await logout()
        } finally {
            navigate("/admin/login", { replace: true })
        }
    }

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <Link to="/admin" className="admin-brand">
                    <span className="admin-brand-mark"><i className="ri-shield-check-line" aria-hidden="true" /></span>
                    <span>For Mate<small>ADMIN</small></span>
                </Link>

                <nav className="admin-nav" aria-label="관리자 메뉴">
                    {MENU_ITEMS.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) => `admin-nav-item${isActive ? " is-active" : ""}`}
                        >
                            <i className={item.icon} aria-hidden="true" />
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="admin-sidebar-bottom">
                    <Link to="/" className="admin-utility-link"><i className="ri-home-line" aria-hidden="true" />일반 서비스로 이동</Link>
                    <button type="button" className="admin-utility-link" onClick={handleLogout}><i className="ri-logout-box-r-line" aria-hidden="true" />로그아웃</button>
                </div>
            </aside>

            <div className="admin-main">
                <header className="admin-header">
                    <div>
                        <p className="admin-header-eyebrow">For Mate 운영센터</p>
                        <h1>{currentItem?.label || "관리자"}</h1>
                    </div>
                    <div className="admin-user"><i className="ri-user-settings-line" aria-hidden="true" /><span>{user?.name || user?.email || "관리자"}</span></div>
                </header>
                <main className="admin-content"><Outlet /></main>
            </div>
        </div>
    )
}
