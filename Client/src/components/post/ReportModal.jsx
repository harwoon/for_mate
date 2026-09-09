import { useState } from "react"
import { createReport } from "../../api/misc.api.js"
import Modal from "../common/Modal.jsx"

const REPORT_REASONS = [
    {
        value: "허위정보",
        label: "허위 정보"
    },
    {
        value: "부적절한내용또는이미지",
        label: "부적절한 내용 또는 이미지"
    },
    {
        value: "광고홍보",
        label: "광고 / 홍보"
    },
    {
        value: "개인정보노출",
        label: "개인정보 노출"
    },
    {
        value: "기타",
        label: "기타"
    }
]

export default function ReportModal({
    postId,
    postType,
    onClose,
    onSuccess
}) {
    const [reason, setReason] = useState("")
    const [detail, setDetail] = useState("")
    const [error, setError] = useState("")
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit() {
        if (!reason) {
            setError("신고 사유를 선택해 주세요.")
            return
        }

        setSubmitting(true)
        setError("")

        try {
            await createReport({
                post_id: Number(postId),
                post_type: postType,
                reason,
                detail: detail.trim()
            })

            onSuccess()
        } catch (error) {
            setError(error.message || "신고 접수에 실패했습니다.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Modal
            title="게시글 신고"
            onClose={submitting ? undefined : onClose}
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        취소
                    </button>

                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={handleSubmit}
                        disabled={submitting}
                    >
                        {submitting ? "신고 중..." : "신고하기"}
                    </button>
                </>
            }
        >
            <div className="stack">
                <p className="text-sub">
                    신고 사유를 선택해 주세요.
                </p>

                <fieldset>
                    <legend className="form-label">
                        신고 사유 *
                    </legend>

                    <div className="stack">
                        {REPORT_REASONS.map((item) => (
                            <label key={item.value}>
                                <input
                                    type="radio"
                                    name="report-reason"
                                    value={item.value}
                                    checked={reason === item.value}
                                    onChange={(event) => {
                                        setReason(event.target.value)
                                        setError("")
                                    }}
                                />

                                {item.label}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className="form-field">
                    <label
                        className="form-label"
                        htmlFor="report-detail"
                    >
                        상세 내용
                    </label>

                    <textarea
                        id="report-detail"
                        className="form-textarea"
                        value={detail}
                        placeholder="신고 사유에 대한 상세 내용을 입력해 주세요. (선택)"
                        onChange={(event) => setDetail(event.target.value)}
                    />
                </div>

                {error && (
                    <p role="alert" className="form-error">
                        {error}
                    </p>
                )}
            </div>
        </Modal>
    )
}