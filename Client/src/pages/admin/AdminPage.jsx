import { useLocation } from "react-router-dom"

const PAGE_INFO = {
    "/admin": { title: "관리자 대시보드", description: "For Mate 서비스 운영 현황을 관리합니다." },
    "/admin/lost-posts": { title: "실종 공고", description: "등록된 실종 공고를 관리하는 화면입니다." },
    "/admin/found-posts": { title: "발견제보", description: "등록된 발견제보를 관리하는 화면입니다." },
    "/admin/reports": { title: "신고 관리", description: "접수된 신고를 확인하고 처리하는 화면입니다." },
    "/admin/inquiries": { title: "문의 관리", description: "사용자 문의를 확인하고 답변하는 화면입니다." }
}

export default function AdminPage() {
    const location = useLocation()
    const pageInfo = PAGE_INFO[location.pathname] || PAGE_INFO["/admin"]

    return (
        <div className="admin-page">
            <div className="admin-page-heading">
                <h2>{pageInfo.title}</h2>
                <p>{pageInfo.description}</p>
            </div>

            {location.pathname === "/admin" ? (
                <>
                    <div className="admin-summary-grid">
                        {[
                            ["실종 공고", "ri-search-eye-line"],
                            ["발견제보", "ri-file-list-3-line"],
                            ["신고", "ri-alarm-warning-line"],
                            ["문의", "ri-question-answer-line"]
                        ].map(([label, icon]) => (
                            <div className="admin-summary-item" key={label}>
                                <i className={icon} aria-hidden="true" />
                                <span>{label}</span>
                                <strong>—</strong>
                                <small>데이터 연결 예정</small>
                            </div>
                        ))}
                    </div>
                    <div className="admin-dashboard-grid">
                        <section className="admin-placeholder-panel"><h3>최근 신고</h3><p>신고 관리 데이터가 연결되면 이곳에 표시됩니다.</p></section>
                        <section className="admin-placeholder-panel"><h3>최근 문의</h3><p>문의 관리 데이터가 연결되면 이곳에 표시됩니다.</p></section>
                        <section className="admin-placeholder-panel"><h3>AI 매칭 현황</h3><p>AI 매칭 관리 기능은 다음 단계에서 연결합니다.</p></section>
                    </div>
                </>
            ) : (
                <section className="admin-placeholder-panel admin-page-placeholder">
                    <i className="ri-tools-line" aria-hidden="true" />
                    <h3>{pageInfo.title} 화면 준비 중</h3>
                    <p>관리 기능은 다음 단계에서 연결합니다.</p>
                </section>
            )}
        </div>
    )
}
