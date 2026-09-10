import {
    useEffect,
    useState
} from "react"
import {
    useLocation
} from "react-router-dom"
import {
    getAdminDashboard
} from "../../api/admin.api.js"

const PAGE_INFO = {
    "/admin": {
        title: "관리자 대시보드",
        description: "For Mate 서비스 운영 현황을 관리합니다."
    },
    "/admin/lost-posts": {
        title: "실종 공고",
        description: "등록된 실종 공고를 관리하는 화면입니다."
    },
    "/admin/found-posts": {
        title: "발견제보",
        description: "등록된 발견제보를 관리하는 화면입니다."
    },
    "/admin/reports": {
        title: "신고 관리",
        description: "접수된 신고를 확인하고 처리하는 화면입니다."
    },
    "/admin/inquiries": {
        title: "문의 관리",
        description: "사용자 문의를 확인하고 답변하는 화면입니다."
    }
}

const EMPTY_DASHBOARD = {
    lost_posts: {
        total: 0,
        active: 0,
        blind: 0
    },
    found_posts: {
        total: 0,
        active: 0,
        blind: 0
    },
    reports: {
        total: 0,
        pending: 0,
        resolved: 0,
        rejected: 0
    },
    inquiries: {
        total: 0,
        pending: 0,
        answered: 0
    }
}

export default function AdminPage() {
    const location = useLocation()

    const pageInfo =
        PAGE_INFO[location.pathname] ||
        PAGE_INFO["/admin"]

    const [dashboard, setDashboard] = useState(
        EMPTY_DASHBOARD
    )
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        if (location.pathname !== "/admin") {
            return
        }

        let cancelled = false

        async function loadDashboard() {
            setLoading(true)
            setError("")

            try {
                const result =
                    await getAdminDashboard()

                if (cancelled) return

                setDashboard({
                    ...EMPTY_DASHBOARD,
                    ...result
                })
            } catch (error) {
                if (!cancelled) {
                    setError(
                        error.message ||
                        "관리자 통계를 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadDashboard()

        return () => {
            cancelled = true
        }
    }, [location.pathname])

    const summaryItems = [
        {
            label: "실종 공고",
            icon: "ri-search-eye-line",
            value: dashboard.lost_posts.total,
            detail:
                `활성 ${dashboard.lost_posts.active} · 블라인드 ${dashboard.lost_posts.blind}`
        },
        {
            label: "발견제보",
            icon: "ri-file-list-3-line",
            value: dashboard.found_posts.total,
            detail:
                `활성 ${dashboard.found_posts.active} · 블라인드 ${dashboard.found_posts.blind}`
        },
        {
            label: "신고",
            icon: "ri-alarm-warning-line",
            value: dashboard.reports.total,
            detail:
                `대기 ${dashboard.reports.pending} · 처리 ${dashboard.reports.resolved}`
        },
        {
            label: "문의",
            icon: "ri-question-answer-line",
            value: dashboard.inquiries.total,
            detail:
                `대기 ${dashboard.inquiries.pending} · 답변 ${dashboard.inquiries.answered}`
        }
    ]

    return (
        <div className="admin-page">
            <div className="admin-page-heading">
                <h2>
                    {pageInfo.title}
                </h2>

                <p>
                    {pageInfo.description}
                </p>
            </div>

            {location.pathname === "/admin" ? (
                <>
                    {loading && (
                        <div className="admin-dashboard-state">
                            <i
                                className="ri-loader-4-line"
                                aria-hidden="true"
                            />

                            <span>
                                운영 현황을 불러오는 중입니다.
                            </span>
                        </div>
                    )}

                    {!loading && error && (
                        <div
                            className="admin-dashboard-state is-error"
                            role="alert"
                        >
                            <i
                                className="ri-error-warning-line"
                                aria-hidden="true"
                            />

                            <span>
                                {error}
                            </span>
                        </div>
                    )}

                    {!loading && !error && (
                        <>
                            <div className="admin-summary-grid">
                                {summaryItems.map((item) => (
                                    <div
                                        className="admin-summary-item"
                                        key={item.label}
                                    >
                                        <i
                                            className={item.icon}
                                            aria-hidden="true"
                                        />

                                        <span>
                                            {item.label}
                                        </span>

                                        <strong>
                                            {item.value}
                                        </strong>

                                        <small>
                                            {item.detail}
                                        </small>
                                    </div>
                                ))}
                            </div>

                            <div className="admin-dashboard-grid">
                                <section className="admin-placeholder-panel">
                                    <div className="admin-panel-heading">
                                        <div>
                                            <h3>
                                                신고 현황
                                            </h3>

                                            <p>
                                                접수된 신고 처리 상태
                                            </p>
                                        </div>

                                        <i
                                            className="ri-alarm-warning-line"
                                            aria-hidden="true"
                                        />
                                    </div>

                                    <div className="admin-stat-list">
                                        <div>
                                            <span>
                                                처리 대기
                                            </span>

                                            <strong>
                                                {dashboard.reports.pending}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>
                                                승인
                                            </span>

                                            <strong>
                                                {dashboard.reports.resolved}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>
                                                반려
                                            </span>

                                            <strong>
                                                {dashboard.reports.rejected}
                                            </strong>
                                        </div>
                                    </div>
                                </section>

                                <section className="admin-placeholder-panel">
                                    <div className="admin-panel-heading">
                                        <div>
                                            <h3>
                                                문의 현황
                                            </h3>

                                            <p>
                                                사용자 문의 답변 상태
                                            </p>
                                        </div>

                                        <i
                                            className="ri-question-answer-line"
                                            aria-hidden="true"
                                        />
                                    </div>

                                    <div className="admin-stat-list">
                                        <div>
                                            <span>
                                                답변 대기
                                            </span>

                                            <strong>
                                                {dashboard.inquiries.pending}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>
                                                답변 완료
                                            </span>

                                            <strong>
                                                {dashboard.inquiries.answered}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>
                                                전체 문의
                                            </span>

                                            <strong>
                                                {dashboard.inquiries.total}
                                            </strong>
                                        </div>
                                    </div>
                                </section>

                                <section className="admin-placeholder-panel">
                                    <div className="admin-panel-heading">
                                        <div>
                                            <h3>
                                                공고 관리
                                            </h3>

                                            <p>
                                                현재 블라인드 공고 현황
                                            </p>
                                        </div>

                                        <i
                                            className="ri-eye-off-line"
                                            aria-hidden="true"
                                        />
                                    </div>

                                    <div className="admin-stat-list">
                                        <div>
                                            <span>
                                                실종 공고
                                            </span>

                                            <strong>
                                                {dashboard.lost_posts.blind}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>
                                                발견제보
                                            </span>

                                            <strong>
                                                {dashboard.found_posts.blind}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>
                                                전체 블라인드
                                            </span>

                                            <strong>
                                                {
                                                    dashboard.lost_posts.blind +
                                                    dashboard.found_posts.blind
                                                }
                                            </strong>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </>
                    )}
                </>
            ) : (
                <section className="admin-placeholder-panel admin-page-placeholder">
                    <i
                        className="ri-tools-line"
                        aria-hidden="true"
                    />

                    <h3>
                        {pageInfo.title} 화면 준비 중
                    </h3>

                    <p>
                        관리 기능은 다음 단계에서 연결합니다.
                    </p>
                </section>
            )}
        </div>
    )
}