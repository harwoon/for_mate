import { formatDateTime } from "../../utils/date.js"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { getAdminInquiries } from "../../api/admin.api.js"

const PAGE_SIZE = 15

const STATUS_LABELS = {
    pending: "답변 대기",
    answered: "답변 완료"
}

export default function AdminInquiriesPage() {
    const [status, setStatus] = useState("")
    const [keyword, setKeyword] = useState("")
    const [inquiries, setInquiries] = useState([])
    const [page, setPage] = useState(1)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function loadInquiries() {
            setLoading(true)
            setError("")

            try {
                const result = await getAdminInquiries()

                if (cancelled) return

                setInquiries(
                    Array.isArray(result)
                        ? result
                        : []
                )
            } catch (error) {
                if (!cancelled) {
                    setInquiries([])

                    setError(
                        error.message ||
                        "문의 목록을 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadInquiries()

        return () => {
            cancelled = true
        }
    }, [retryCount])

    const filteredInquiries = useMemo(() => {
        const searchKeyword =
            keyword.trim().toLowerCase()

        return inquiries.filter((inquiry) => {
            if (
                status &&
                inquiry.status !== status
            ) {
                return false
            }

            if (!searchKeyword) {
                return true
            }

            const values = [
                inquiry.inquiry_id,
                inquiry.user_id,
                inquiry.type,
                inquiry.title,
                inquiry.status
            ]

            return values.some((value) => (
                String(value ?? "")
                    .toLowerCase()
                    .includes(searchKeyword)
            ))
        })
    }, [
        inquiries,
        status,
        keyword
    ])

    const totalPages = Math.max(
        1,
        Math.ceil(
            filteredInquiries.length / PAGE_SIZE
        )
    )

    const currentPage = Math.min(
        page,
        totalPages
    )

    const visibleInquiries =
        filteredInquiries.slice(
            (currentPage - 1) * PAGE_SIZE,
            currentPage * PAGE_SIZE
        )

    function handleStatusChange(nextStatus) {
        setStatus(nextStatus)
        setPage(1)
    }

    function handleKeywordChange(event) {
        setKeyword(event.target.value)
        setPage(1)
    }

    return (
        <div className="admin-page">
            <div className="admin-page-heading">
                <h2>
                    문의 관리
                </h2>

                <p>
                    사용자가 등록한 문의를 확인하고 답변합니다.
                </p>
            </div>

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
                            답변 대기
                        </button>

                        <button
                            type="button"
                            className={
                                status === "answered"
                                    ? "admin-status-tab is-active"
                                    : "admin-status-tab"
                            }
                            onClick={() => (
                                handleStatusChange("answered")
                            )}
                        >
                            답변 완료
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
                            placeholder="제목, 유형, 문의 ID, 사용자 ID 검색"
                            onChange={handleKeywordChange}
                        />
                    </div>
                </div>

                <div className="admin-list-summary">
                    총{" "}
                    <strong>
                        {filteredInquiries.length}
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
                            문의 목록을 불러오는 중입니다.
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
                    filteredInquiries.length === 0 && (
                        <div className="admin-list-state">
                            <i
                                className="ri-question-answer-line"
                                aria-hidden="true"
                            />

                            <span>
                                조건에 맞는 문의가 없습니다.
                            </span>
                        </div>
                    )}

                {!loading &&
                    !error &&
                    filteredInquiries.length > 0 && (
                        <>
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>
                                                문의 ID
                                            </th>

                                            <th>
                                                유형
                                            </th>

                                            <th>
                                                제목
                                            </th>

                                            <th>
                                                사용자
                                            </th>

                                            <th>
                                                상태
                                            </th>

                                            <th>
                                                등록일
                                            </th>

                                            <th>
                                                관리
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {visibleInquiries.map(
                                            (inquiry) => (
                                                <tr
                                                    key={
                                                        inquiry.inquiry_id
                                                    }
                                                >
                                                    <td className="admin-table-id">
                                                        #
                                                        {
                                                            inquiry.inquiry_id
                                                        }
                                                    </td>

                                                    <td>
                                                        <span className="admin-inquiry-type">
                                                            {
                                                                inquiry.type ||
                                                                "-"
                                                            }
                                                        </span>
                                                    </td>

                                                    <td>
                                                        <strong className="admin-inquiry-title">
                                                            {
                                                                inquiry.title ||
                                                                "제목 없음"
                                                            }
                                                        </strong>
                                                    </td>

                                                    <td>
                                                        <span className="admin-user-id">
                                                            USER #
                                                            {
                                                                inquiry.user_id
                                                            }
                                                        </span>
                                                    </td>

                                                    <td>
                                                        <span
                                                            className={`admin-status-badge is-${inquiry.status}`}
                                                        >
                                                            {
                                                                STATUS_LABELS[
                                                                    inquiry
                                                                        .status
                                                                ] ||
                                                                inquiry.status
                                                            }
                                                        </span>
                                                    </td>

                                                    <td className="admin-table-date">
                                                        {formatDateTime(
                                                            inquiry.created_at
                                                        )}
                                                    </td>

                                                    <td>
                                                        <Link
                                                            to={`/admin/inquiries/${inquiry.inquiry_id}`}
                                                            className="admin-view-button"
                                                        >
                                                            <i
                                                                className="ri-eye-line"
                                                                aria-hidden="true"
                                                            />

                                                            보기
                                                        </Link>
                                                    </td>
                                                </tr>
                                            )
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