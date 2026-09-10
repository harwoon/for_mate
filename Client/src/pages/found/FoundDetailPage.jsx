import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import {
    deleteFoundPost,
    getFoundPost
} from "../../api/foundPosts.api.js"
import AlertModal from "../../components/common/AlertModal.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import ReportModal from "../../components/post/ReportModal.jsx"
import { formatDate, formatDateTime } from "../../utils/date.js"

function displayValue(value) {
    return value || "정보 없음"
}

function displayColors(value) {
    if (!value) return "정보 없음"

    return String(value)
        .split(",")
        .map((color) => color.trim())
        .filter(Boolean)
        .join(", ")
}

export default function FoundDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()

    const [post, setPost] = useState(null)
    const [currentImageIndex, setCurrentImageIndex] = useState(0)
    const [failedImages, setFailedImages] = useState({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [actionError, setActionError] = useState("")
    const [retryCount, setRetryCount] = useState(0)
    const [deleting, setDeleting] = useState(false)
    const [reported, setReported] = useState(false)

    const [reportOpen, setReportOpen] = useState(false)
    const [alertOpen, setAlertOpen] = useState(false)
    const [alertTitle, setAlertTitle] = useState("")
    const [alertMessage, setAlertMessage] = useState("")

    useEffect(() => {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        })
    }, [id])

    useEffect(() => {
        let cancelled = false

        async function loadPost() {
            setLoading(true)
            setError("")

            try {
                const result = await getFoundPost(id)

                if (cancelled) return

                setPost(result)
                setCurrentImageIndex(0)
                setFailedImages({})
                setReported(false)
            } catch (error) {
                if (!cancelled) {
                    setPost(null)
                    setError(
                        error.message ||
                        "발견제보 게시글을 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadPost()

        return () => {
            cancelled = true
        }
    }, [id, retryCount])

    const images = post?.images ?? []
    const currentImage = images[currentImageIndex]

    function handlePreviousImage() {
        if (images.length < 2) return

        setCurrentImageIndex((index) => (
            index === 0
                ? images.length - 1
                : index - 1
        ))
    }

    function handleNextImage() {
        if (images.length < 2) return

        setCurrentImageIndex((index) => (
            index === images.length - 1
                ? 0
                : index + 1
        ))
    }

    async function handleDelete() {
        const confirmed = window.confirm(
            "이 발견제보 게시글을 삭제하시겠습니까?"
        )

        if (!confirmed) return

        setDeleting(true)
        setActionError("")

        try {
            await deleteFoundPost(id)

            navigate("/found-posts", {
                replace: true
            })
        } catch (error) {
            setActionError(
                error.message ||
                "발견제보 게시글을 삭제하지 못했습니다."
            )
        } finally {
            setDeleting(false)
        }
    }

    function handleReportSuccess() {
        setReportOpen(false)
        setReported(true)

        setAlertTitle("신고 접수 완료")
        setAlertMessage(
            "신고가 정상적으로 접수되었습니다."
        )
        setAlertOpen(true)
    }

    if (loading) {
        return (
            <Loading message="발견제보 게시글을 불러오는 중입니다." />
        )
    }

    if (error) {
        return (
            <ErrorState
                message={error}
                onRetry={() =>
                    setRetryCount(
                        (count) => count + 1
                    )
                }
                onHome={() => navigate("/")}
            />
        )
    }

    if (!post) {
        return (
            <Empty message="발견제보 게시글을 찾을 수 없습니다." />
        )
    }

    const currentImageFailed =
        currentImage &&
        failedImages[currentImageIndex]

    return (
        <div className="container found-detail-page">
            <Breadcrumb
                items={[
                    {
                        label: "홈",
                        to: "/"
                    },
                    {
                        label: "발견제보",
                        to: "/found-posts"
                    },
                    {
                        label: "상세"
                    }
                ]}
            />

            <div className="page-header found-detail-header">
                <div>
                    <h1 className="page-title">
                        발견제보 상세
                    </h1>

                    <p className="page-desc">
                        발견된 동물의 사진과 제보 정보를 확인해주세요.
                    </p>
                </div>

                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() =>
                        navigate("/found-posts")
                    }
                >
                    <i
                        className="ri-arrow-left-line"
                        aria-hidden="true"
                    />
                    목록으로
                </button>
            </div>

            {post.status === "blind" && (
                <div className="found-detail-blind-notice">
                    <i
                        className="ri-error-warning-line"
                        aria-hidden="true"
                    />

                    <div>
                        <strong>
                            블라인드 처리된 게시글입니다.
                        </strong>

                        {post.blind_reason && (
                            <p>
                                사유: {post.blind_reason}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <section className="found-detail-layout">
                <div className="found-detail-gallery">
                    <div className="found-detail-main-image">
                        {currentImage && !currentImageFailed ? (
                            <img
                                src={imageUrl(currentImage)}
                                alt={`${post.title || "발견동물"} 사진 ${currentImageIndex + 1}`}
                                onError={() =>
                                    setFailedImages(
                                        (current) => ({
                                            ...current,
                                            [currentImageIndex]: true
                                        })
                                    )
                                }
                            />
                        ) : (
                            <div className="found-detail-image-empty">
                                <i
                                    className="ri-image-line"
                                    aria-hidden="true"
                                />

                                <span>
                                    등록된 사진이 없습니다.
                                </span>
                            </div>
                        )}

                        {images.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    className="found-detail-image-arrow is-prev"
                                    onClick={handlePreviousImage}
                                    aria-label="이전 사진"
                                >
                                    <i
                                        className="ri-arrow-left-s-line"
                                        aria-hidden="true"
                                    />
                                </button>

                                <button
                                    type="button"
                                    className="found-detail-image-arrow is-next"
                                    onClick={handleNextImage}
                                    aria-label="다음 사진"
                                >
                                    <i
                                        className="ri-arrow-right-s-line"
                                        aria-hidden="true"
                                    />
                                </button>

                                <span className="found-detail-image-count">
                                    {currentImageIndex + 1} / {images.length}
                                </span>
                            </>
                        )}
                    </div>

                    {images.length > 1 && (
                        <div className="found-detail-thumbnails">
                            {images.map((image, index) => (
                                <button
                                    key={`${image}-${index}`}
                                    type="button"
                                    className={
                                        index === currentImageIndex
                                            ? "found-detail-thumbnail is-active"
                                            : "found-detail-thumbnail"
                                    }
                                    onClick={() =>
                                        setCurrentImageIndex(index)
                                    }
                                    aria-label={`${index + 1}번째 사진 보기`}
                                >
                                    {!failedImages[index] ? (
                                        <img
                                            src={imageUrl(image)}
                                            alt=""
                                            onError={() =>
                                                setFailedImages(
                                                    (current) => ({
                                                        ...current,
                                                        [index]: true
                                                    })
                                                )
                                            }
                                        />
                                    ) : (
                                        <span>
                                            <i
                                                className="ri-image-line"
                                                aria-hidden="true"
                                            />
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <article className="card card-padded found-detail-info">
                    <div className="found-detail-info-top">
                        <div className="found-detail-status">
                            <span
                                className={
                                    post.status === "blind"
                                        ? "found-detail-badge is-blind"
                                        : "found-detail-badge"
                                }
                            >
                                {post.status === "blind"
                                    ? "블라인드"
                                    : "발견제보"}
                            </span>

                            <span className="text-sub">
                                등록일{" "}
                                {formatDateTime(
                                    post.created_at,
                                    "정보 없음"
                                )}
                            </span>
                        </div>

                        <h2>
                            {displayValue(post.title)}
                        </h2>

                        <p className="found-detail-subtitle">
                            {displayValue(post.breed)}
                            {post.species
                                ? ` · ${post.species}`
                                : ""}
                        </p>
                    </div>

                    <dl className="found-detail-meta">
                        <div>
                            <dt>
                                <i
                                    className="ri-user-line"
                                    aria-hidden="true"
                                />
                                작성자
                            </dt>

                            <dd>
                                {displayValue(
                                    post.author?.name
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-shapes-line"
                                    aria-hidden="true"
                                />
                                종류
                            </dt>

                            <dd>
                                {displayValue(post.species)}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-information-line"
                                    aria-hidden="true"
                                />
                                품종
                            </dt>

                            <dd>
                                {displayValue(post.breed)}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-palette-line"
                                    aria-hidden="true"
                                />
                                색상
                            </dt>

                            <dd>
                                {displayColors(post.color)}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-map-pin-line"
                                    aria-hidden="true"
                                />
                                발견 위치
                            </dt>

                            <dd>
                                {displayValue(post.region)}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-calendar-line"
                                    aria-hidden="true"
                                />
                                발견 날짜
                            </dt>

                            <dd>
                                {formatDate(
                                    post.find_date,
                                    "정보 없음"
                                )}
                            </dd>
                        </div>
                    </dl>

                    <div className="found-detail-description">
                        <h3>
                            제보 내용
                        </h3>

                        <p>
                            {displayValue(post.description)}
                        </p>
                    </div>

                    {actionError && (
                        <p
                            className="form-error"
                            role="alert"
                        >
                            {actionError}
                        </p>
                    )}

                    {post.is_owner ? (
                        <div className="found-detail-actions">
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() =>
                                    navigate(
                                        `/found-edit/${id}`
                                    )
                                }
                            >
                                제보 수정
                            </button>

                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting
                                    ? "삭제 중..."
                                    : "게시글 삭제"}
                            </button>
                        </div>
                    ) : (
                        <div className="found-detail-actions">
                            <button
                                type="button"
                                className={
                                    reported
                                        ? "btn btn-outline"
                                        : "btn btn-danger"
                                }
                                onClick={() =>
                                    setReportOpen(true)
                                }
                                disabled={reported}
                            >
                                {reported
                                    ? "신고 완료"
                                    : "신고하기"}
                            </button>
                        </div>
                    )}
                </article>
            </section>

            {reportOpen && (
                <ReportModal
                    postId={id}
                    postType="found"
                    onClose={() =>
                        setReportOpen(false)
                    }
                    onSuccess={handleReportSuccess}
                />
            )}

            <AlertModal
                open={alertOpen}
                title={alertTitle}
                message={alertMessage}
                onConfirm={() =>
                    setAlertOpen(false)
                }
            />
        </div>
    )
}