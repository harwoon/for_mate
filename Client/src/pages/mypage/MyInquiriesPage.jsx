import { formatTimestampDate as formatDate } from "../../utils/date.js"
import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { getInquiries } from "../../api/inquiries.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import Pagination from "../../components/common/Pagination.jsx"

const PAGE_SIZE = 20

function getStatusLabel(status) {
    return status === "answered"
        ? "답변 완료"
        : "답변 대기"
}

export default function MyInquiriesPage() {
    const navigate = useNavigate()

    const [inquiries, setInquiries] = useState([])
    const [status, setStatus] = useState("")
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
                const result = await getInquiries()

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
                        "문의글을 불러오지 못했습니다."
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

    const filteredInquiries = inquiries.filter(
        (inquiry) => (
            !status ||
            inquiry.status === status
        )
    )

    const startIndex =
        (page - 1) * PAGE_SIZE

    const currentInquiries =
        filteredInquiries.slice(
            startIndex,
            startIndex + PAGE_SIZE
        )

    function handleStatusChange(nextStatus) {
        setStatus(nextStatus)
        setPage(1)
    }

    return (
        <>
            {!error && (
                <Loading
                    loading={loading}
                    message="문의글을 불러오는 중입니다."
                />
            )}

            {!loading && error && (
                <ErrorState
                    message={error}
                    onRetry={() => (
                        setRetryCount(
                            (count) => count + 1
                        )
                    )}
                    onHome={() => navigate("/")}
                />
            )}

            {!error && (
                <div className="container">
                    <Breadcrumb
                        items={[
                            {
                                label: "홈",
                                to: "/"
                            },
                            {
                                label: "마이페이지",
                                to: "/mypage"
                            },
                            {
                                label: "내 문의글"
                            }
                        ]}
                    />

                    <div className="page-header">
                        <div>
                            <h1 className="page-title">
                                내 문의글
                            </h1>

                            <p className="page-desc">
                                내가 등록한 문의와 답변 상태를 확인할 수 있습니다.
                            </p>
                        </div>

                        <Link
                            to="/support"
                            className="btn btn-primary"
                        >
                            문의하기
                        </Link>
                    </div>

                    <div className="row-between">
                        <div className="row">
                            <button
                                type="button"
                                className={
                                    status === ""
                                        ? "btn btn-primary"
                                        : "btn btn-outline"
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
                                        ? "btn btn-primary"
                                        : "btn btn-outline"
                                }
                                onClick={() => (
                                    handleStatusChange(
                                        "pending"
                                    )
                                )}
                            >
                                답변 대기
                            </button>

                            <button
                                type="button"
                                className={
                                    status === "answered"
                                        ? "btn btn-primary"
                                        : "btn btn-outline"
                                }
                                onClick={() => (
                                    handleStatusChange(
                                        "answered"
                                    )
                                )}
                            >
                                답변 완료
                            </button>
                        </div>

                        <span className="text-sub">
                            총 {filteredInquiries.length}건
                        </span>
                    </div>

                    {!loading &&
                        filteredInquiries.length === 0 && (
                            <Empty message="등록한 문의글이 없습니다." />
                        )}

                    {!loading &&
                        currentInquiries.length > 0 && (
                            <>
                                <div className="stack">
                                    {currentInquiries.map(
                                        (inquiry) => (
                                            <Link
                                                key={
                                                    inquiry.inquiry_id
                                                }
                                                to={`/mypage/inquiries/${inquiry.inquiry_id}`}
                                                className="card card-padded"
                                            >
                                                <div className="row-between">
                                                    <div className="stack">
                                                        <span className="text-sub">
                                                            {inquiry.type ||
                                                            "일반 문의"}
                                                        </span>

                                                        <strong>
                                                            {inquiry.title}
                                                        </strong>
                                                    </div>

                                                    <div className="stack">
                                                        <span
                                                            className={
                                                                inquiry.status === "answered"
                                                                    ? "badge badge-rescue"
                                                                    : "badge"
                                                            }
                                                        >
                                                            {getStatusLabel(
                                                                inquiry.status
                                                            )}
                                                        </span>

                                                        <span className="text-sub">
                                                            {formatDate(
                                                                inquiry.created_at
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            </Link>
                                        )
                                    )}
                                </div>

                                <Pagination
                                    page={page}
                                    total={
                                        filteredInquiries.length
                                    }
                                    size={PAGE_SIZE}
                                    onChange={setPage}
                                />
                            </>
                        )}
                </div>
            )}
        </>
    )
}