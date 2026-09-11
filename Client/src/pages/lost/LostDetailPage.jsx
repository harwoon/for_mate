import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { deleteLostPost, getLostPost } from "../../api/lostPosts.api.js"
import AlertModal from "../../components/common/AlertModal.jsx"
import Badge from "../../components/common/Badge.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import PostNavigation from "../../components/common/PostNavigation.jsx"
import ReportModal from "../../components/post/ReportModal.jsx"
import { formatDate, formatTimestampDate } from "../../utils/date.js"

const SEX_LABELS = {
    M: "수컷",
    F: "암컷",
    Q: "미상"
}

const NEUTER_LABELS = {
    Y: "중성화 완료",
    N: "중성화 안 됨",
    U: "미상"
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

export default function LostDetailPage() {
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
                const result = await getLostPost(id)

                if (cancelled) return

                setPost(result)
                setCurrentImageIndex(0)
                setFailedImages({})
            } catch (error) {
                if (!cancelled) {
                    setPost(null)
                    setError(
                        error.message ||
                        "실종 공고를 불러오지 못했습니다."
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
            "이 실종 공고를 삭제하시겠습니까?"
        )

        if (!confirmed) return

        setDeleting(true)
        setActionError("")

        try {
            await deleteLostPost(id)
            navigate("/lost-posts", { replace: true })
        } catch (error) {
            setActionError(
                error.message ||
                "실종 공고를 삭제하지 못했습니다."
            )
        } finally {
            setDeleting(false)
        }
    }

    function handleReportButtonClick() {
        if (post.is_reported) {
            setAlertTitle("신고 안내")
            setAlertMessage("이미 신고한 게시글입니다.")
            setAlertOpen(true)
            return
        }

        setReportOpen(true)
    }

    function handleReportSuccess() {
        setReportOpen(false)

        setPost((current) => ({
            ...current,
            is_reported: true
        }))

        setAlertTitle("신고 접수 완료")
        setAlertMessage(
            "신고가 정상적으로 접수되었습니다."
        )
        setAlertOpen(true)
    }

    if (loading) {
        return (
            <Loading message="실종 공고를 불러오는 중입니다." />
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
            <Empty message="실종 공고를 찾을 수 없습니다." />
        )
    }

    const currentImageFailed =
        currentImage &&
        failedImages[currentImage.id]

    return (
        <div className="container lost-detail-page">
            <Breadcrumb
                items={[
                    {
                        label: "홈",
                        to: "/"
                    },
                    {
                        label: "찾고있어요",
                        to: "/lost-posts"
                    },
                    {
                        label: "상세"
                    }
                ]}
            />

            <div className="page-header lost-detail-header">
                <div>
                    <h1 className="page-title">
                        실종 공고 상세
                    </h1>

                    <p className="page-desc">
                        실종동물의 사진과 상세 정보를 확인해주세요.
                    </p>
                </div>

                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigate("/lost-posts")}
                >
                    <i
                        className="ri-arrow-left-line"
                        aria-hidden="true"
                    />
                    목록으로
                </button>
            </div>

            <section className="lost-detail-layout">
                <div className="lost-detail-gallery">
                    <div className="lost-detail-main-image">
                        {currentImage && !currentImageFailed ? (
                            <img
                                src={imageUrl(
                                    currentImage.image_url
                                )}
                                alt={`${post.pet_name || post.breed || "실종동물"} 사진 ${currentImageIndex + 1}`}
                                onError={() =>
                                    setFailedImages(
                                        (current) => ({
                                            ...current,
                                            [currentImage.id]: true
                                        })
                                    )
                                }
                            />
                        ) : (
                            <div className="lost-detail-image-empty">
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
                                    className="lost-detail-image-arrow is-prev"
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
                                    className="lost-detail-image-arrow is-next"
                                    onClick={handleNextImage}
                                    aria-label="다음 사진"
                                >
                                    <i
                                        className="ri-arrow-right-s-line"
                                        aria-hidden="true"
                                    />
                                </button>

                                <span className="lost-detail-image-count">
                                    {currentImageIndex + 1} / {images.length}
                                </span>
                            </>
                        )}
                    </div>

                    {images.length > 1 && (
                        <div className="lost-detail-thumbnails">
                            {images.map((image, index) => (
                                <button
                                    key={image.id}
                                    type="button"
                                    className={
                                        index === currentImageIndex
                                            ? "lost-detail-thumbnail is-active"
                                            : "lost-detail-thumbnail"
                                    }
                                    onClick={() =>
                                        setCurrentImageIndex(index)
                                    }
                                    aria-label={`${index + 1}번째 사진 보기`}
                                >
                                    {!failedImages[image.id] ? (
                                        <img
                                            src={imageUrl(
                                                image.image_url
                                            )}
                                            alt=""
                                            onError={() =>
                                                setFailedImages(
                                                    (current) => ({
                                                        ...current,
                                                        [image.id]: true
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

                <article className="card card-padded lost-detail-info">
                    <div className="lost-detail-info-top">
                        <div className="lost-detail-status">
                            <Badge type="lost">
                                {post.status === "blind"
                                    ? "블라인드"
                                    : "찾는 중"}
                            </Badge>

                            <span className="text-sub">
                                등록일{" "}
                                {formatTimestampDate(
                                    post.created_at,
                                    "정보 없음"
                                )}
                            </span>
                        </div>

                        <h2>
                            {displayValue(post.pet_name)}
                        </h2>

                        <p className="lost-detail-subtitle">
                            {displayValue(post.breed)}
                            {post.species
                                ? ` · ${post.species}`
                                : ""}
                        </p>
                    </div>

                    <dl className="lost-detail-meta">
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
                                    className="ri-user-line"
                                    aria-hidden="true"
                                />
                                성별
                            </dt>

                            <dd>
                                {SEX_LABELS[post.sex] ||
                                    "정보 없음"}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-heart-pulse-line"
                                    aria-hidden="true"
                                />
                                중성화
                            </dt>

                            <dd>
                                {NEUTER_LABELS[
                                    post.neuter_yn
                                ] || "정보 없음"}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-map-pin-line"
                                    aria-hidden="true"
                                />
                                실종 지역
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
                                실종 날짜
                            </dt>

                            <dd>
                                {formatDate(
                                    post.event_date,
                                    "정보 없음"
                                )}
                            </dd>
                        </div>
                    </dl>

                    <div className="lost-detail-description">
                        <h3>특징 및 상세 설명</h3>

                        <p>
                            {displayValue(post.description)}
                        </p>
                    </div>

                    {actionError && (
                        <p
                            role="alert"
                            className="form-error"
                        >
                            {actionError}
                        </p>
                    )}

                    {post.is_owner ? (
                        <div className="lost-detail-actions">
                            <div className="lost-detail-owner-actions">
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() =>
                                        navigate(
                                            `/lost-edit/${id}`
                                        )
                                    }
                                >
                                    공고 수정
                                </button>

                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                >
                                    {deleting
                                        ? "삭제 중..."
                                        : "공고 삭제"}
                                </button>
                            </div>

                            <button
                                type="button"
                                className="btn btn-primary lost-detail-ai-button"
                                onClick={() =>
                                    navigate(
                                        `/lost-posts/${id}/matches`
                                    )
                                }
                            >
                                <i
                                    className="ri-sparkling-line"
                                    aria-hidden="true"
                                />
                                AI 매칭 결과 확인
                            </button>
                        </div>
                    ) : (
                        <div className="lost-detail-actions">
                            <button
                                type="button"
                                className={
                                    post.is_reported
                                        ? "btn btn-outline"
                                        : "btn btn-danger"
                                }
                                onClick={handleReportButtonClick}
                            >
                                {post.is_reported
                                    ? "신고 완료"
                                    : "신고하기"}
                            </button>
                        </div>
                    )}
                </article>
            </section>

            <PostNavigation
                previousPost={post.previous_post}
                nextPost={post.next_post}
                basePath="/lost-posts"
            />

            {reportOpen && (
                <ReportModal
                    postId={id}
                    postType="lost"
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