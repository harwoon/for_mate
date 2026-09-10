import { formatTimestampDate as formatDate } from "../../utils/date.js"
import { useEffect, useState } from "react"
import {
    Link,
    useNavigate,
    useParams
} from "react-router-dom"
import { getInquiry } from "../../api/inquiries.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"

export default function MyInquiryDetailPage() {
    const { inquiryId } = useParams()
    const navigate = useNavigate()

    const [inquiry, setInquiry] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function loadInquiry() {
            setLoading(true)
            setError("")

            try {
                const result = await getInquiry(
                    inquiryId
                )

                if (cancelled) return

                setInquiry(result)
            } catch (error) {
                if (!cancelled) {
                    setInquiry(null)

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

        loadInquiry()

        return () => {
            cancelled = true
        }
    }, [
        inquiryId,
        retryCount
    ])

    if (error) {
        return (
            <ErrorState
                message={error}
                onRetry={() => (
                    setRetryCount(
                        (count) => count + 1
                    )
                )}
                onHome={() => navigate("/")}
            />
        )
    }

    if (!loading && !inquiry) {
        return (
            <Empty message="문의글을 찾을 수 없습니다." />
        )
    }

    return (
        <>
            <Loading
                loading={loading}
                message="문의글을 불러오는 중입니다."
            />

            {inquiry && (
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
                                label: "내 문의글",
                                to: "/mypage/inquiries"
                            },
                            {
                                label: "상세"
                            }
                        ]}
                    />

                    <div className="page-header">
                        <h1 className="page-title">
                            문의 상세
                        </h1>
                    </div>

                    <section className="card card-padded stack">
                        <div className="row-between">
                            <span className="text-sub">
                                {inquiry.type ||
                                "일반 문의"}
                            </span>

                            <span
                                className={
                                    inquiry.status === "answered"
                                        ? "badge badge-rescue"
                                        : "badge"
                                }
                            >
                                {inquiry.status === "answered"
                                    ? "답변 완료"
                                    : "답변 대기"}
                            </span>
                        </div>

                        <h2>
                            {inquiry.title}
                        </h2>

                        <span className="text-sub">
                            작성일{" "}
                            {formatDate(
                                inquiry.created_at
                            )}
                        </span>

                        <div>
                            <h3>문의 내용</h3>

                            <p>
                                {inquiry.content}
                            </p>
                        </div>
                    </section>

                    <section className="card card-padded stack">
                        <h2>관리자 답변</h2>

                        {inquiry.status === "answered" ? (
                            <>
                                <p>
                                    {inquiry.answer ||
                                    "등록된 답변 내용이 없습니다."}
                                </p>

                                <span className="text-sub">
                                    답변일{" "}
                                    {formatDate(
                                        inquiry.answered_at
                                    )}
                                </span>
                            </>
                        ) : (
                            <p className="text-sub">
                                아직 답변이 등록되지 않았습니다.
                            </p>
                        )}
                    </section>

                    <div className="row">
                        <Link
                            to="/mypage/inquiries"
                            className="btn btn-outline"
                        >
                            목록으로
                        </Link>

                        <Link
                            to="/support"
                            className="btn btn-primary"
                        >
                            새 문의 작성
                        </Link>
                    </div>
                </div>
            )}
        </>
    )
}