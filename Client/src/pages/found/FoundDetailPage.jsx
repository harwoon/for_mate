import { formatDateTime as formatCreatedAt } from "../../utils/date.js"
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

function formatDate(value) {
    return value
        ? String(value).slice(0, 10)
        : "정보 없음"
}

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

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [actionError, setActionError] = useState("")
    const [retryCount, setRetryCount] = useState(0)
    const [deleting, setDeleting] = useState(false)

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
                onRetry={() => (
                    setRetryCount(
                        (count) => count + 1
                    )
                )}
                onHome={() => navigate("/")}
            />
        )
    }

    if (!post) {
        return (
            <Empty message="발견제보 게시글을 찾을 수 없습니다." />
        )
    }

    return (
        <div className="container">
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

            <div className="page-header">
                <h1 className="page-title">
                    발견제보 상세
                </h1>
            </div>

            <section>
                <div>
                    {currentImage ? (
                        <img
                            src={imageUrl(currentImage)}
                            alt={`${post.title} 사진 ${currentImageIndex + 1}`}
                        />
                    ) : (
                        <Empty message="등록된 이미지가 없습니다." />
                    )}

                    {images.length > 0 && (
                        <div className="row-between">
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={handlePreviousImage}
                                disabled={images.length < 2}
                            >
                                이전
                            </button>

                            <span>
                                {currentImageIndex + 1} / {images.length}
                            </span>

                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={handleNextImage}
                                disabled={images.length < 2}
                            >
                                다음
                            </button>
                        </div>
                    )}
                </div>

                <div className="stack">
                    <div className="row-between">
                        <span className="badge">
                            발견제보
                        </span>

                        <span className="text-sub">
                            등록일 {formatCreatedAt(post.created_at, "정보 없음")}
                        </span>
                    </div>

                    <h2>
                        {displayValue(post.title)}
                    </h2>

                    <dl>
                        <div>
                            <dt>
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
                                동물 종류
                            </dt>

                            <dd>
                                {displayValue(
                                    post.species
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                품종
                            </dt>

                            <dd>
                                {displayValue(
                                    post.breed
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                색상
                            </dt>

                            <dd>
                                {displayColors(
                                    post.color
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                발견 위치
                            </dt>

                            <dd>
                                {displayValue(
                                    post.region
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                발견 날짜
                            </dt>

                            <dd>
                                {formatDate(
                                    post.find_date
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                상세 내용
                            </dt>

                            <dd>
                                {displayValue(
                                    post.description
                                )}
                            </dd>
                        </div>
                    </dl>

                    {actionError && (
                        <p
                            className="form-error"
                            role="alert"
                        >
                            {actionError}
                        </p>
                    )}

                    {post.is_owner ? (
                        <div className="row">
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => (
                                    navigate(
                                        `/found-edit/${id}`
                                    )
                                )}
                            >
                                제보 수정
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting
                                    ? "삭제 중..."
                                    : "게시글 삭제"}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => (
                                setReportOpen(true)
                            )}
                        >
                            신고하기
                        </button>
                    )}
                </div>
            </section>

            {reportOpen && (
                <ReportModal
                    postId={id}
                    postType="found"
                    onClose={() => (
                        setReportOpen(false)
                    )}
                    onSuccess={handleReportSuccess}
                />
            )}

            <AlertModal
                open={alertOpen}
                title={alertTitle}
                message={alertMessage}
                onConfirm={() => (
                    setAlertOpen(false)
                )}
            />
        </div>
    )
}
