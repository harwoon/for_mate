import { useEffect, useMemo, useState } from "react"
import {
    createAdminFaq,
    deleteAdminFaq,
    getAdminFaqs,
    updateAdminFaq,
    updateAdminFaqOrder,
    updateAdminFaqStatus
} from "../../api/admin.api.js"
import { formatDateTime } from "../../utils/date.js"

const STATUS_LABELS = {
    published: "게시중",
    draft: "숨김"
}

const EMPTY_FORM = {
    question: "",
    answer: "",
    status: "published"
}

export default function AdminFaqsPage() {
    const [faqs, setFaqs] = useState([])
    const [status, setStatus] = useState("")
    const [keyword, setKeyword] = useState("")

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [reloadCount, setReloadCount] = useState(0)

    const [editorOpen, setEditorOpen] = useState(false)
    const [editingFaq, setEditingFaq] = useState(null)
    const [form, setForm] = useState(EMPTY_FORM)
    const [saving, setSaving] = useState(false)
    const [actionMessage, setActionMessage] = useState("")

    useEffect(() => {
        let cancelled = false

        async function loadFaqs() {
            setLoading(true)
            setError("")

            try {
                const result = await getAdminFaqs()

                if (cancelled) return

                setFaqs(
                    Array.isArray(result?.items)
                        ? result.items
                        : []
                )
            } catch (error) {
                if (!cancelled) {
                    setFaqs([])
                    setError(
                        error.message ||
                        "FAQ 목록을 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadFaqs()

        return () => {
            cancelled = true
        }
    }, [reloadCount])

    const filteredFaqs = useMemo(() => {
        const searchKeyword = keyword
            .trim()
            .toLowerCase()

        return faqs.filter((faq) => {
            if (
                status &&
                faq.status !== status
            ) {
                return false
            }

            if (!searchKeyword) {
                return true
            }

            return [
                faq.id,
                faq.question,
                faq.answer
            ].some((value) => (
                String(value ?? "")
                    .toLowerCase()
                    .includes(searchKeyword)
            ))
        })
    }, [faqs, status, keyword])

    const canReorder =
        status === "" &&
        keyword.trim() === ""

    function openCreateEditor() {
        setEditingFaq(null)
        setForm(EMPTY_FORM)
        setEditorOpen(true)
        setActionMessage("")
    }

    function openEditEditor(faq) {
        setEditingFaq(faq)

        setForm({
            question: faq.question ?? "",
            answer: faq.answer ?? "",
            status: faq.status ?? "published"
        })

        setEditorOpen(true)
        setActionMessage("")
    }

    function closeEditor() {
        if (saving) return

        setEditorOpen(false)
        setEditingFaq(null)
        setForm(EMPTY_FORM)
    }

    function handleFormChange(event) {
        const { name, value } = event.target

        setForm((current) => ({
            ...current,
            [name]: value
        }))
    }

    async function handleSubmit(event) {
        event.preventDefault()

        const question = form.question.trim()
        const answer = form.answer.trim()

        if (!question) {
            window.alert("질문을 입력해주세요.")
            return
        }

        if (question.length > 200) {
            window.alert("질문은 200자 이하로 입력해주세요.")
            return
        }

        if (!answer) {
            window.alert("답변을 입력해주세요.")
            return
        }

        setSaving(true)

        try {
            const data = {
                question,
                answer,
                status: form.status
            }

            if (editingFaq) {
                await updateAdminFaq(
                    editingFaq.id,
                    data
                )

                setActionMessage(
                    "FAQ가 수정되었습니다."
                )
            } else {
                await createAdminFaq(data)

                setActionMessage(
                    "FAQ가 등록되었습니다."
                )
            }

            setEditorOpen(false)
            setEditingFaq(null)
            setForm(EMPTY_FORM)
            setReloadCount(
                (count) => count + 1
            )
        } catch (error) {
            window.alert(
                error.message ||
                "FAQ 저장에 실패했습니다."
            )
        } finally {
            setSaving(false)
        }
    }

    async function handleStatusToggle(faq) {
        const nextStatus =
            faq.status === "published"
                ? "draft"
                : "published"

        try {
            const updated = await updateAdminFaqStatus(
                faq.id,
                nextStatus
            )

            setFaqs((current) => (
                current.map((item) => (
                    item.id === faq.id
                        ? updated
                        : item
                ))
            ))

            setActionMessage(
                nextStatus === "published"
                    ? "FAQ가 게시되었습니다."
                    : "FAQ가 숨김 처리되었습니다."
            )
        } catch (error) {
            window.alert(
                error.message ||
                "FAQ 상태 변경에 실패했습니다."
            )
        }
    }

    async function handleDelete(faq) {
        const confirmed = window.confirm(
            `"${faq.question}" FAQ를 삭제하시겠습니까?`
        )

        if (!confirmed) return

        try {
            await deleteAdminFaq(faq.id)

            setActionMessage(
                "FAQ가 삭제되었습니다."
            )

            setReloadCount(
                (count) => count + 1
            )
        } catch (error) {
            window.alert(
                error.message ||
                "FAQ 삭제에 실패했습니다."
            )
        }
    }

    async function handleMove(faqId, direction) {
        if (!canReorder) return

        const currentIndex = faqs.findIndex(
            (faq) => faq.id === faqId
        )

        if (currentIndex < 0) return

        const nextIndex =
            currentIndex + direction

        if (
            nextIndex < 0 ||
            nextIndex >= faqs.length
        ) {
            return
        }

        const nextFaqs = [...faqs]

        const [
            movedFaq
        ] = nextFaqs.splice(
            currentIndex,
            1
        )

        nextFaqs.splice(
            nextIndex,
            0,
            movedFaq
        )

        const orderItems = nextFaqs.map(
            (faq, index) => ({
                id: Number(faq.id),
                display_order: index + 1
            })
        )

        try {
            const result = await updateAdminFaqOrder(
                orderItems
            )

            setFaqs(
                Array.isArray(result?.items)
                    ? result.items
                    : nextFaqs
            )

            setActionMessage(
                "FAQ 노출 순서가 변경되었습니다."
            )
        } catch (error) {
            window.alert(
                error.message ||
                "FAQ 순서 변경에 실패했습니다."
            )
        }
    }

    return (
        <div className="admin-page">
            <div className="admin-page-heading admin-faq-heading">
                <div>
                    <h2>
                        FAQ 관리
                    </h2>

                    <p>
                        고객센터에 노출되는 자주 묻는 질문을 관리합니다.
                    </p>
                </div>

                <button
                    type="button"
                    className="admin-faq-create-button"
                    onClick={openCreateEditor}
                >
                    <i
                        className="ri-add-line"
                        aria-hidden="true"
                    />

                    FAQ 등록
                </button>
            </div>

            {actionMessage && (
                <div className="admin-action-message">
                    <i
                        className="ri-checkbox-circle-line"
                        aria-hidden="true"
                    />

                    {actionMessage}
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
                            onClick={() => {
                                setStatus("")
                                setActionMessage("")
                            }}
                        >
                            전체
                        </button>

                        <button
                            type="button"
                            className={
                                status === "published"
                                    ? "admin-status-tab is-active"
                                    : "admin-status-tab"
                            }
                            onClick={() => {
                                setStatus("published")
                                setActionMessage("")
                            }}
                        >
                            게시중
                        </button>

                        <button
                            type="button"
                            className={
                                status === "draft"
                                    ? "admin-status-tab is-active"
                                    : "admin-status-tab"
                            }
                            onClick={() => {
                                setStatus("draft")
                                setActionMessage("")
                            }}
                        >
                            숨김
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
                            placeholder="질문, 답변, FAQ ID 검색"
                            onChange={(event) => {
                                setKeyword(
                                    event.target.value
                                )
                            }}
                        />
                    </div>
                </div>

                <div className="admin-list-summary admin-faq-summary">
                    <span>
                        총{" "}
                        <strong>
                            {filteredFaqs.length}
                        </strong>
                        건
                    </span>

                    {!canReorder && (
                        <span>
                            순서 변경은 전체 목록에서 가능합니다.
                        </span>
                    )}
                </div>

                {loading && (
                    <div className="admin-list-state">
                        <i
                            className="ri-loader-4-line admin-spin"
                            aria-hidden="true"
                        />

                        <span>
                            FAQ 목록을 불러오는 중입니다.
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
                                setReloadCount(
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
                    filteredFaqs.length === 0 && (
                        <div className="admin-list-state">
                            <i
                                className="ri-questionnaire-line"
                                aria-hidden="true"
                            />

                            <span>
                                조건에 맞는 FAQ가 없습니다.
                            </span>
                        </div>
                    )}

                {!loading &&
                    !error &&
                    filteredFaqs.length > 0 && (
                        <div className="admin-table-wrap">
                            <table className="admin-table admin-faq-table">
                                <thead>
                                    <tr>
                                        <th>
                                            순서
                                        </th>

                                        <th>
                                            FAQ
                                        </th>

                                        <th>
                                            상태
                                        </th>

                                        <th>
                                            수정일
                                        </th>

                                        <th>
                                            관리
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filteredFaqs.map(
                                        (faq) => {
                                            const realIndex =
                                                faqs.findIndex(
                                                    (item) => (
                                                        item.id === faq.id
                                                    )
                                                )

                                            return (
                                                <tr
                                                    key={faq.id}
                                                >
                                                    <td>
                                                        <div className="admin-faq-order">
                                                            <strong>
                                                                {faq.display_order}
                                                            </strong>

                                                            <div className="admin-faq-order-buttons">
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        !canReorder ||
                                                                        realIndex === 0
                                                                    }
                                                                    onClick={() => (
                                                                        handleMove(
                                                                            faq.id,
                                                                            -1
                                                                        )
                                                                    )}
                                                                    title="위로 이동"
                                                                >
                                                                    <i
                                                                        className="ri-arrow-up-s-line"
                                                                        aria-hidden="true"
                                                                    />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        !canReorder ||
                                                                        realIndex ===
                                                                            faqs.length - 1
                                                                    }
                                                                    onClick={() => (
                                                                        handleMove(
                                                                            faq.id,
                                                                            1
                                                                        )
                                                                    )}
                                                                    title="아래로 이동"
                                                                >
                                                                    <i
                                                                        className="ri-arrow-down-s-line"
                                                                        aria-hidden="true"
                                                                    />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td>
                                                        <div className="admin-faq-content">
                                                            <div className="admin-faq-question-row">
                                                                <span>
                                                                    Q
                                                                </span>

                                                                <strong>
                                                                    {faq.question}
                                                                </strong>
                                                            </div>

                                                            <p>
                                                                {faq.answer}
                                                            </p>
                                                        </div>
                                                    </td>

                                                    <td>
                                                        <span
                                                            className={`admin-status-badge is-${faq.status}`}
                                                        >
                                                            {
                                                                STATUS_LABELS[
                                                                    faq.status
                                                                ] ||
                                                                faq.status
                                                            }
                                                        </span>
                                                    </td>

                                                    <td className="admin-table-date">
                                                        {formatDateTime(
                                                            faq.updated_at ||
                                                            faq.created_at
                                                        )}
                                                    </td>

                                                    <td>
                                                        <div className="admin-faq-actions">
                                                            <button
                                                                type="button"
                                                                className="admin-faq-action-button"
                                                                onClick={() => (
                                                                    openEditEditor(
                                                                        faq
                                                                    )
                                                                )}
                                                            >
                                                                <i
                                                                    className="ri-edit-line"
                                                                    aria-hidden="true"
                                                                />

                                                                수정
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="admin-faq-action-button"
                                                                onClick={() => (
                                                                    handleStatusToggle(
                                                                        faq
                                                                    )
                                                                )}
                                                            >
                                                                <i
                                                                    className={
                                                                        faq.status ===
                                                                        "published"
                                                                            ? "ri-eye-off-line"
                                                                            : "ri-eye-line"
                                                                    }
                                                                    aria-hidden="true"
                                                                />

                                                                {faq.status ===
                                                                "published"
                                                                    ? "숨김"
                                                                    : "게시"}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="admin-faq-action-button is-delete"
                                                                onClick={() => (
                                                                    handleDelete(
                                                                        faq
                                                                    )
                                                                )}
                                                            >
                                                                <i
                                                                    className="ri-delete-bin-line"
                                                                    aria-hidden="true"
                                                                />

                                                                삭제
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        }
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
            </section>

            {editorOpen && (
                <div
                    className="admin-faq-modal-backdrop"
                    onMouseDown={(event) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            closeEditor()
                        }
                    }}
                >
                    <div
                        className="admin-faq-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="admin-faq-modal-title"
                    >
                        <div className="admin-faq-modal-header">
                            <div>
                                <span>
                                    FAQ
                                </span>

                                <h3 id="admin-faq-modal-title">
                                    {editingFaq
                                        ? "FAQ 수정"
                                        : "FAQ 등록"}
                                </h3>
                            </div>

                            <button
                                type="button"
                                className="admin-faq-modal-close"
                                onClick={closeEditor}
                                disabled={saving}
                                aria-label="닫기"
                            >
                                <i
                                    className="ri-close-line"
                                    aria-hidden="true"
                                />
                            </button>
                        </div>

                        <form
                            className="admin-faq-form"
                            onSubmit={handleSubmit}
                        >
                            <label>
                                질문
                                <span>
                                    *
                                </span>
                            </label>

                            <input
                                type="text"
                                name="question"
                                value={form.question}
                                maxLength={200}
                                placeholder="사용자가 자주 묻는 질문을 입력해주세요."
                                onChange={handleFormChange}
                                disabled={saving}
                            />

                            <div className="admin-faq-character-count">
                                {form.question.length} / 200
                            </div>

                            <label>
                                답변
                                <span>
                                    *
                                </span>
                            </label>

                            <textarea
                                name="answer"
                                value={form.answer}
                                placeholder="FAQ 답변 내용을 입력해주세요."
                                onChange={handleFormChange}
                                disabled={saving}
                            />

                            <label>
                                노출 상태
                            </label>

                            <select
                                name="status"
                                value={form.status}
                                onChange={handleFormChange}
                                disabled={saving}
                            >
                                <option value="published">
                                    게시
                                </option>

                                <option value="draft">
                                    숨김
                                </option>
                            </select>

                            <p className="admin-faq-form-help">
                                숨김 상태의 FAQ는 사용자 고객센터에 노출되지 않습니다.
                            </p>

                            <div className="admin-faq-form-actions">
                                <button
                                    type="button"
                                    className="admin-faq-cancel-button"
                                    onClick={closeEditor}
                                    disabled={saving}
                                >
                                    취소
                                </button>

                                <button
                                    type="submit"
                                    className="admin-faq-submit-button"
                                    disabled={saving}
                                >
                                    {saving && (
                                        <i
                                            className="ri-loader-4-line admin-spin"
                                            aria-hidden="true"
                                        />
                                    )}

                                    {editingFaq
                                        ? "수정 완료"
                                        : "FAQ 등록"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}