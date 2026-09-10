import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
    getAdminReports,
    updateAdminReport
} from "../../api/admin.api.js"

const PAGE_SIZE = 15

const STATUS_LABELS = {
    pending: "처리 대기",
    resolved: "승인",
    rejected: "반려"
}

const POST_TYPE_LABELS = {
    lost: "실종 공고",
    found: "발견제보"
}

function formatDateTime(value) {
    if (!value) return "-"

    return String(value)
        .slice(0, 16)
        .replace("T", " ")
        .replaceAll("-", ".")
}

function getPostPath(report) {
    if (report.post_type === "lost") {
        return `/lost-posts/${report.post_id}`
    }

    if (report.post_type === "found") {
        return `/found-posts/${report.post_id}`
    }

    return null
}

export default function AdminReportsPage() {
    const [status, setStatus] = useState("")
    const [keyword, setKeyword] = useState("")
    const [reports, setReports] = useState([])
    const [page, setPage] = useState(1)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [actionMessage, setActionMessage] = useState("")
    const [processingId, setProcessingId] = useState(null)
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function loadReports() {
            setLoading(true)
            setError("")

            try {
                const result = await getAdminReports({
                    status
                })

                if (cancelled) return

                setReports(
                    Array.isArray(result)
                        ? result
                        : []
                )

                setPage(1)
            } catch (error) {
                if (!cancelled) {
                    setReports([])

                    setError(
                        error.message ||
                        "신고 목록을 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadReports()

        return () => {
            cancelled = true
        }
    }, [
        status,
        retryCount
    ])

    const filteredReports = useMemo(() => {
        const searchKeyword =
            keyword.trim().toLowerCase()

        if (!searchKeyword) {
            return reports
        }

        return reports.filter((report) => {
            const values = [
                report.report_id,
                report.post_id,
                report.user_id,
                report.reason,
                report.detail,
                report.post_type
            ]

            return values.some((value) => (
                String(value ?? "")
                    .toLowerCase()
                    .includes(searchKeyword)
            ))
        })
    }, [
        reports,
        keyword
    ])

    const totalPages = Math.max(
        1,
        Math.ceil(
            filteredReports.length / PAGE_SIZE
        )
    )

    const currentPage = Math.min(
        page,
        totalPages
    )

    const visibleReports = filteredReports.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    )

    function handleStatusChange(nextStatus) {
        setStatus(nextStatus)
        setPage(1)
        setActionMessage("")
    }

    function handleKeywordChange(event) {
        setKeyword(event.target.value)
        setPage(1)
    }

    async function handleProcess(report, nextStatus) {
        const isApprove = nextStatus === "resolved"

        const message = isApprove
            ? "이 신고를 승인하시겠습니까?\n승인하면 신고 대상 게시글이 블라인드 처리됩니다."
            : "이 신고를 반려하시겠습니까?"

        const confirmed = window.confirm(message)

        if (!confirmed) return

        setProcessingId(report.report_id)
        setError("")
        setActionMessage("")

        try {
            await updateAdminReport(
                report.report_id,
                nextStatus
            )

            setActionMessage(
                isApprove
                    ? "신고를 승인하고 게시글을 블라인드 처리했습니다."
                    : "신고를 반려했습니다."
            )

            setRetryCount(
                (count) => count + 1
            )
        } catch (error) {
            setError(
                error.message ||
                "신고 처리에 실패했습니다."
            )
        } finally {
            setProcessingId(null)
        }
    }

    return (
        <div className="admin-page">
            <div className="admin-page-heading">
                <h2>
                    신고 관리
                </h2>

                <p>
                    접수된 신고를 확인하고 승인 또는 반려합니다.
                </p>
            </div>

            {actionMessage && (
                <div className="admin-action-message">
                    <i
                        className="ri-checkbox-circle-line"
                        aria-hidden="true"
                    />

                    <span>
                        {actionMessage}
                    </span>
                </div>
            )}

            <section className="admin-list-panel">
                <div className="admin-list-toolbar">
                    <div className="admin-status-tabs">
                        <button
                            type="button"
                            className={
                                status === ""
                                    ? "admin-status-tab is-active"
                                    : "admin-status-tab"
                            }
                            onClick={() => (
                                handleStatusChange("")
                            )}
                        >
                            전체
                        </button>

                        <button
                            type="button"
                            className={
                                status === "pending"
                                    ? "admin-status-tab is-active"
                                    : "admin-status-tab"
                            }
                            onClick={() => (
                                handleStatusChange("pending")
                            )}
                        >
                            처리 대기
                        </button>

                        <button
                            type="button"
                            className={
                                status === "resolved"
                                    ? "admin-status-tab is-active"
                                    : "admin-status-tab"
                            }
                            onClick={() => (
                                handleStatusChange("resolved")
                            )}
                        >
                            승인
                        </button>

                        <button
                            type="button"
                            className={
                                status === "rejected"
                                    ? "admin-status-tab is-active"
                                    : "admin-status-tab"
                            }
                            onClick={() => (
                                handleStatusChange("rejected")
                            )}
                        >
                            반려
                        </button>
                    </div>

                    <div className="admin-search-box">
                        <i
                            className="ri-search-line"
                            aria-hidden="true"
                        />

                        <input
                            type="search"
                            value={keyword}
                            placeholder="신고 사유, 게시글 ID, 사용자 ID 검색"
                            onChange={handleKeywordChange}
                        />
                    </div>
                </div>

                <div className="admin-list-summary">
                    총{" "}
                    <strong>
                        {filteredReports.length}
                    </strong>
                    건
                </div>

                {loading && (
                    <div className="admin-list-state">
                        <i
                            className="ri-loader-4-line admin-spin"
                            aria-hidden="true"
                        />

                        <span>
                            신고 목록을 불러오는 중입니다.
                        </span>
                    </div>
                )}

                {!loading && error && (
                    <div className="admin-list-state is-error">
                        <i
                            className="ri-error-warning-line"
                            aria-hidden="true"
                        />

                        <p>
                            {error}
                        </p>

                        <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => (
                                setRetryCount(
                                    (count) => count + 1
                                )
                            )}
                        >
                            다시 시도
                        </button>
                    </div>
                )}

                {!loading &&
                    !error &&
                    filteredReports.length === 0 && (
                        <div className="admin-list-state">
                            <i
                                className="ri-inbox-2-line"
                                aria-hidden="true"
                            />

                            <span>
                                조건에 맞는 신고가 없습니다.
                            </span>
                        </div>
                    )}

                {!loading &&
                    !error &&
                    filteredReports.length > 0 && (
                        <>
                            <div className="admin-table-wrap">
                                <table className="admin-table admin-report-table">
                                    <thead>
                                        <tr>
                                            <th>
                                                신고 ID
                                            </th>

                                            <th>
                                                신고 대상
                                            </th>

                                            <th>
                                                신고자
                                            </th>

                                            <th>
                                                신고 사유
                                            </th>

                                            <th>
                                                상세 내용
                                            </th>

                                            <th>
                                                상태
                                            </th>

                                            <th>
                                                접수일
                                            </th>

                                            <th>
                                                관리
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {visibleReports.map(
                                            (report) => {
                                                const postPath =
                                                    getPostPath(
                                                        report
                                                    )

                                                const processing =
                                                    processingId ===
                                                    report.report_id

                                                return (
                                                    <tr
                                                        key={
                                                            report.report_id
                                                        }
                                                    >
                                                        <td className="admin-table-id">
                                                            #
                                                            {
                                                                report.report_id
                                                            }
                                                        </td>

                                                        <td>
                                                            <div className="admin-table-main">
                                                                <strong>
                                                                    {
                                                                        POST_TYPE_LABELS[
                                                                            report
                                                                                .post_type
                                                                        ] ||
                                                                        report
                                                                            .post_type
                                                                    }
                                                                </strong>

                                                                <span>
                                                                    게시글 #
                                                                    {
                                                                        report.post_id
                                                                    }
                                                                </span>
                                                            </div>
                                                        </td>

                                                        <td>
                                                            <span className="admin-user-id">
                                                                USER #
                                                                {
                                                                    report.user_id
                                                                }
                                                            </span>
                                                        </td>

                                                        <td>
                                                            <strong className="admin-report-reason">
                                                                {
                                                                    report.reason ||
                                                                    "-"
                                                                }
                                                            </strong>
                                                        </td>

                                                        <td>
                                                            <p className="admin-report-detail">
                                                                {
                                                                    report.detail ||
                                                                    "상세 내용 없음"
                                                                }
                                                            </p>
                                                        </td>

                                                        <td>
                                                            <span
                                                                className={`admin-status-badge is-${report.status}`}
                                                            >
                                                                {
                                                                    STATUS_LABELS[
                                                                        report
                                                                            .status
                                                                    ] ||
                                                                    report.status
                                                                }
                                                            </span>
                                                        </td>

                                                        <td className="admin-table-date">
                                                            {formatDateTime(
                                                                report.created_at
                                                            )}
                                                        </td>

                                                        <td>
                                                            <div className="admin-report-actions">
                                                                {postPath && (
                                                                    <Link
                                                                        to={
                                                                            postPath
                                                                        }
                                                                        className="admin-view-button"
                                                                    >
                                                                        <i
                                                                            className="ri-eye-line"
                                                                            aria-hidden="true"
                                                                        />

                                                                        보기
                                                                    </Link>
                                                                )}

                                                                {report.status ===
                                                                    "pending" && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            className="admin-report-button is-approve"
                                                                            disabled={
                                                                                processing
                                                                            }
                                                                            onClick={() => (
                                                                                handleProcess(
                                                                                    report,
                                                                                    "resolved"
                                                                                )
                                                                            )}
                                                                        >
                                                                            승인
                                                                        </button>

                                                                        <button
                                                                            type="button"
                                                                            className="admin-report-button is-reject"
                                                                            disabled={
                                                                                processing
                                                                            }
                                                                            onClick={() => (
                                                                                handleProcess(
                                                                                    report,
                                                                                    "rejected"
                                                                                )
                                                                            )}
                                                                        >
                                                                            반려
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            }
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div className="admin-table-pagination">
                                    <button
                                        type="button"
                                        disabled={
                                            currentPage === 1
                                        }
                                        onClick={() => (
                                            setPage(
                                                currentPage - 1
                                            )
                                        )}
                                        aria-label="이전 페이지"
                                    >
                                        <i
                                            className="ri-arrow-left-s-line"
                                            aria-hidden="true"
                                        />
                                    </button>

                                    <span>
                                        <strong>
                                            {currentPage}
                                        </strong>
                                        {" / "}
                                        {totalPages}
                                    </span>

                                    <button
                                        type="button"
                                        disabled={
                                            currentPage ===
                                            totalPages
                                        }
                                        onClick={() => (
                                            setPage(
                                                currentPage + 1
                                            )
                                        )}
                                        aria-label="다음 페이지"
                                    >
                                        <i
                                            className="ri-arrow-right-s-line"
                                            aria-hidden="true"
                                        />
                                    </button>
                                </div>
                            )}
                        </>
                    )}
            </section>
        </div>
    )
}