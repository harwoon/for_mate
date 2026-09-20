import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
    createComment,
    deleteComment,
    getComments,
    updateComment
} from "../../api/comments.api.js"
import { useAuth } from "../../context/AuthContext.jsx"

const MAX_LENGTH = 1000

function formatCommentDate(value) {
    if (!value) return ""
    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(value))
}

function CommentForm({ initialContent = "", initialSecret = false, submitLabel, onSubmit, onCancel }) {
    const [content, setContent] = useState(initialContent)
    const [isSecret, setIsSecret] = useState(initialSecret)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")

    async function handleSubmit(event) {
        event.preventDefault()
        if (!content.trim() || submitting) return
        setSubmitting(true)
        setError("")
        try {
            await onSubmit({ content: content.trim(), is_secret: isSecret })
            setContent("")
            setIsSecret(false)
        } catch (err) {
            setError(err.message || "댓글을 저장하지 못했습니다.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <form className="comment-form" onSubmit={handleSubmit}>
            <textarea
                value={content}
                maxLength={MAX_LENGTH}
                placeholder="댓글을 입력해주세요."
                onChange={(event) => setContent(event.target.value)}
            />
            <div className="comment-form-footer">
                <label className="comment-secret-toggle">
                    <input
                        type="checkbox"
                        checked={isSecret}
                        onChange={(event) => setIsSecret(event.target.checked)}
                    />
                    <i className="ri-lock-line" aria-hidden="true" />
                    보호 댓글
                </label>
                <span className="comment-length">{content.length}/{MAX_LENGTH}</span>
                {onCancel && (
                    <button type="button" className="btn btn-outline" onClick={onCancel}>
                        취소
                    </button>
                )}
                <button type="submit" className="btn btn-primary" disabled={!content.trim() || submitting}>
                    {submitting ? "저장 중..." : submitLabel}
                </button>
            </div>
            {error && <p className="comment-error" role="alert">{error}</p>}
        </form>
    )
}

function CommentItem({ comment, user, onReload, onReply, isReply = false }) {
    const [editing, setEditing] = useState(false)

    async function handleDelete() {
        if (!window.confirm("댓글을 삭제하시겠습니까?")) return
        await deleteComment(comment.id)
        await onReload()
    }

    return (
        <article className={isReply ? "comment-item is-reply" : "comment-item"}>
            <div className="comment-item-head">
                <strong>{comment.is_deleted ? "알 수 없음" : comment.author.name}</strong>
                {comment.is_secret && <span className="comment-secret-badge"><i className="ri-lock-line" /> 보호</span>}
                <time>{formatCommentDate(comment.created_at)}</time>
            </div>

            {editing ? (
                <CommentForm
                    initialContent={comment.content || ""}
                    initialSecret={comment.is_secret}
                    submitLabel="수정 완료"
                    onCancel={() => setEditing(false)}
                    onSubmit={async (data) => {
                        await updateComment(comment.id, data)
                        setEditing(false)
                        await onReload()
                    }}
                />
            ) : (
                <p className={comment.is_hidden || comment.is_deleted ? "comment-content is-muted" : "comment-content"}>
                    {comment.is_deleted
                        ? "삭제된 댓글입니다."
                        : comment.is_hidden
                            ? "보호 댓글입니다."
                            : comment.content}
                </p>
            )}

            {!editing && !comment.is_deleted && (
                <div className="comment-actions">
                    {!isReply && user && <button type="button" onClick={() => onReply(comment.id)}>답글</button>}
                    {comment.can_edit && <button type="button" onClick={() => setEditing(true)}>수정</button>}
                    {comment.can_delete && <button type="button" onClick={handleDelete}>삭제</button>}
                </div>
            )}
        </article>
    )
}

export default function CommentSection({ postType, postId }) {
    const navigate = useNavigate()
    const { user } = useAuth()
    const [comments, setComments] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [replyingTo, setReplyingTo] = useState(null)

    async function loadComments() {
        try {
            const result = await getComments(postType, postId)
            setComments(result?.items ?? [])
            setTotal(result?.total ?? 0)
            setError("")
        } catch (err) {
            setError(err.message || "댓글을 불러오지 못했습니다.")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        setLoading(true)
        loadComments()
    }, [postType, postId])

    async function submitComment(data, parentId = null) {
        await createComment(postType, postId, { ...data, parent_id: parentId })
        setReplyingTo(null)
        await loadComments()
    }

    return (
        <section className="card card-padded comment-section">
            <div className="comment-section-title">
                <h2>댓글</h2>
                <span>{total}</span>
            </div>

            {user ? (
                <CommentForm submitLabel="댓글 등록" onSubmit={(data) => submitComment(data)} />
            ) : (
                <button type="button" className="comment-login-prompt" onClick={() => navigate("/login")}>
                    댓글을 작성하려면 로그인해주세요.
                </button>
            )}

            {loading ? (
                <p className="comment-state">댓글을 불러오는 중입니다.</p>
            ) : error ? (
                <p className="comment-error" role="alert">{error}</p>
            ) : comments.length === 0 ? (
                <p className="comment-state">첫 댓글을 남겨보세요.</p>
            ) : (
                <div className="comment-list">
                    {comments.map((comment) => (
                        <div key={comment.id}>
                            <CommentItem
                                comment={comment}
                                user={user}
                                onReload={loadComments}
                                onReply={setReplyingTo}
                            />
                            {replyingTo === comment.id && (
                                <div className="comment-reply-form">
                                    <CommentForm
                                        submitLabel="답글 등록"
                                        onCancel={() => setReplyingTo(null)}
                                        onSubmit={(data) => submitComment(data, comment.id)}
                                    />
                                </div>
                            )}
                            {comment.replies.map((reply) => (
                                <CommentItem
                                    key={reply.id}
                                    comment={reply}
                                    user={user}
                                    onReload={loadComments}
                                    isReply
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </section>
    )
}
