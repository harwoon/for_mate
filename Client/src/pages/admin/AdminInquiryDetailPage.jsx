import { useEffect, useState } from "react"
import {
    Link,
    useParams
} from "react-router-dom"
import {
    answerAdminInquiry,
    getAdminInquiry
} from "../../api/admin.api.js"

const STATUS_LABELS = {
    pending: "답변 대기",
    answered: "답변 완료"
}

function formatDateTime(value) {
    if (!value) return "-"

    return String(value)
        .slice(0, 16)
        .replace("T", " ")
        .replaceAll("-", ".")
}

export default function AdminInquiryDetailPage() {
    const { inquiryId } = useParams()

    const [inquiry, setInquiry] = useState(null)
    const [answer, setAnswer] = useState("")

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [successMessage, setSuccessMessage] = useState("")
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function loadInquiry() {
            setLoading(true)
            setError("")
            setSuccessMessage("")

            try {
                const result =
                    await getAdminInquiry(
                        inquiryId
                    )

                if (cancelled) return

                setInquiry(result)
                setAnswer("")
            } catch (error) {
                if (!cancelled) {
                    setInquiry(null)

                    setError(
                        error.message ||
                        "문의를 불러오지 못했습니다."
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

    async function handleSubmit(event) {
        event.preventDefault()

        const trimmedAnswer =
            answer.trim()

        if (!trimmedAnswer) {
            setError(
                "답변 내용을 입력해 주세요."
            )

            return
        }

        const confirmed = window.confirm(
            "이 답변을 등록하시겠습니까?\n등록 후에는 현재 API 기준으로 다시 답변할 수 없습니다."
        )

        if (!confirmed) return

        setSubmitting(true)
        setError("")
        setSuccessMessage("")

        try {
            await answerAdminInquiry(
                inquiryId,
                trimmedAnswer
            )

            const result =
                await getAdminInquiry(
                    inquiryId
                )

            setInquiry(result)
            setAnswer("")

            setSuccessMessage(
                "문의 답변이 등록되었습니다."
            )
        } catch (error) {
            setError(
                error.message ||
                "답변 등록에 실패했습니다."
            )
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="admin-list-state">
                <i
                    className="ri-loader-4-line admin-spin"
                    aria-hidden="true"
                />

                <span>
                    문의 내용을 불러오는 중입니다.
                </span>
            </div>
        )
    }

    if (error && !inquiry) {
        return (
            <div className="admin-page">
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
                        className="btn btn-outline"
                        onClick={() => (
                            setRetryCount(
                                (count) => count + 1
                            )
                        )}
                    >
                        다시 시도
                    </button>
                </div>
            </div>
        )
    }

    if (!inquiry) {
        return null
    }

    const answered =
        inquiry.status === "answered"

    return (
        <div className="admin-page">
            <div className="admin-detail-top">
                <div className="admin-page-heading">
                    <h2>
                        문의 상세
                    </h2>

                    <p>
                        문의 내용을 확인하고 답변합니다.
                    </p>
                </div>

                <Link
                    to="/admin/inquiries"
                    className="admin-back-button"
                >
                    <i
                        className="ri-arrow-left-line"
                        aria-hidden="true"
                    />

                    목록으로
                </Link>
            </div>

            {successMessage && (
                <div className="admin-action-message">
                    <i
                        className="ri-checkbox-circle-line"
                        aria-hidden="true"
                    />

                    <span>
                        {successMessage}
                    </span>
                </div>
            )}

            {error && inquiry && (
                <div className="admin-action-message is-error">
                    <i
                        className="ri-error-warning-line"
                        aria-hidden="true"
                    />

                    <span>
                        {error}
                    </span>
                </div>
            )}

            <div className="admin-inquiry-detail-grid">
                <section className="admin-detail-panel">
                    <div className="admin-detail-panel-header">
                        <div>
                            <span className="admin-detail-id">
                                문의 #{inquiry.inquiry_id}
                            </span>

                            <h3>
                                {inquiry.title}
                            </h3>
                        </div>

                        <span
                            className={`admin-status-badge is-${inquiry.status}`}
                        >
                            {
                                STATUS_LABELS[
                                    inquiry.status
                                ] ||
                                inquiry.status
                            }
                        </span>
                    </div>

                    <div className="admin-detail-meta">
                        <div>
                            <span>
                                문의 유형
                            </span>

                            <strong>
                                {inquiry.type || "-"}
                            </strong>
                        </div>

                        <div>
                            <span>
                                문의자
                            </span>

                            <strong>
                                USER #{inquiry.user_id}
                            </strong>
                        </div>

                        <div>
                            <span>
                                등록일
                            </span>

                            <strong>
                                {formatDateTime(
                                    inquiry.created_at
                                )}
                            </strong>
                        </div>
                    </div>

                    <div className="admin-inquiry-content">
                        <h4>
                            문의 내용
                        </h4>

                        <p>
                            {inquiry.content ||
                                "문의 내용이 없습니다."}
                        </p>
                    </div>
                </section>

                <section className="admin-detail-panel">
                    <div className="admin-detail-panel-header">
                        <div>
                            <span className="admin-detail-section-label">
                                ADMIN ANSWER
                            </span>

                            <h3>
                                관리자 답변
                            </h3>
                        </div>

                        <i
                            className="ri-question-answer-line admin-detail-heading-icon"
                            aria-hidden="true"
                        />
                    </div>

                    {answered ? (
                        <div className="admin-answer-complete">
                            <div className="admin-answer-date">
                                <i
                                    className="ri-checkbox-circle-line"
                                    aria-hidden="true"
                                />

                                답변 완료 ·{" "}
                                {formatDateTime(
                                    inquiry.answered_at
                                )}
                            </div>

                            <p>
                                {inquiry.answer ||
                                    "등록된 답변이 없습니다."}
                            </p>
                        </div>
                    ) : (
                        <form
                            className="admin-answer-form"
                            onSubmit={handleSubmit}
                        >
                            <label htmlFor="admin-answer">
                                답변 내용
                            </label>

                            <textarea
                                id="admin-answer"
                                value={answer}
                                placeholder="사용자에게 전달할 답변을 입력해 주세요."
                                onChange={(event) => {
                                    setAnswer(
                                        event.target.value
                                    )

                                    setError("")
                                }}
                                disabled={submitting}
                            />

                            <div className="admin-answer-footer">
                                <span>
                                    답변을 등록하면 문의 상태가 답변 완료로 변경됩니다.
                                </span>

                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={
                                        submitting ||
                                        !answer.trim()
                                    }
                                >
                                    {submitting
                                        ? "등록 중..."
                                        : "답변 등록"}
                                </button>
                            </div>
                        </form>
                    )}
                </section>
            </div>
        </div>
    )
}