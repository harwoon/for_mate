import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { deleteLostPost, getLostPost } from "../../api/lostPosts.api.js"
import AlertModal from "../../components/common/AlertModal.jsx"
import Badge from "../../components/common/Badge.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import PostNavigation from "../../components/common/PostNavigation.jsx"
import ReportModal from "../../components/post/ReportModal.jsx"

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

function formatDate(value) {
    return value ? String(value).slice(0, 10) : "정보 없음"
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
            } catch (error) {
                if (!cancelled) {
                    setPost(null)
                    setError(error.message || "실종 공고를 불러오지 못했습니다.")
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
            index === 0 ? images.length - 1 : index - 1
        ))
    }

    function handleNextImage() {
        if (images.length < 2) return

        setCurrentImageIndex((index) => (
            index === images.length - 1 ? 0 : index + 1
        ))
    }

    async function handleDelete() {
        const confirmed = window.confirm("이 실종 공고를 삭제하시겠습니까?")

        if (!confirmed) return

        setDeleting(true)
        setActionError("")

        try {
            await deleteLostPost(id)
            navigate("/lost-posts", { replace: true })
        } catch (error) {
            setActionError(error.message || "실종 공고를 삭제하지 못했습니다.")
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
        setAlertMessage("신고가 정상적으로 접수되었습니다.")
        setAlertOpen(true)
    }

    if (loading) {
        return <Loading message="실종 공고를 불러오는 중입니다." />
    }

    if (error) {
        return (
            <ErrorState
                message={error}
                onRetry={() => setRetryCount((count) => count + 1)}
            />
        )
    }

    if (!post) {
        return <Empty message="실종 공고를 찾을 수 없습니다." />
    }

    return (
        <div className="container">
            <Breadcrumb
                items={[
                    { label: "홈", to: "/" },
                    { label: "찾고있어요", to: "/lost-posts" },
                    { label: "상세" }
                ]}
            />

            <div className="page-header">
                <h1 className="page-title">
                    실종 공고 상세
                </h1>
            </div>

            <section>
                <div>
                    {currentImage ? (
                        <img
                            src={currentImage.image_url}
                            alt={`${post.pet_name || post.breed || "실종 동물"} 사진 ${currentImageIndex + 1}`}
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
                                aria-label="이전 사진"
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
                                aria-label="다음 사진"
                            >
                                다음
                            </button>
                        </div>
                    )}
                </div>

                <div className="stack">
                    <div className="row-between">
                        <Badge type="lost">
                            {post.status === "closed" ? "종료" : "실종"}
                        </Badge>

                        <span className="text-sub">
                            등록일 {formatDate(post.created_at)}
                        </span>
                    </div>

                    <h2>{displayValue(post.pet_name)}</h2>

                    <dl>
                        <div>
                            <dt>동물 종류</dt>
                            <dd>{displayValue(post.species)}</dd>
                        </div>

                        <div>
                            <dt>품종</dt>
                            <dd>{displayValue(post.breed)}</dd>
                        </div>

                        <div>
                            <dt>색상</dt>
                            <dd>{displayColors(post.color)}</dd>
                        </div>

                        <div>
                            <dt>성별</dt>
                            <dd>{SEX_LABELS[post.sex] || "정보 없음"}</dd>
                        </div>

                        <div>
                            <dt>중성화 여부</dt>
                            <dd>{NEUTER_LABELS[post.neuter_yn] || "정보 없음"}</dd>
                        </div>

                        <div>
                            <dt>실종 지역</dt>
                            <dd>{displayValue(post.region)}</dd>
                        </div>

                        <div>
                            <dt>실종 날짜</dt>
                            <dd>{formatDate(post.event_date)}</dd>
                        </div>

                        <div>
                            <dt>특징</dt>
                            <dd>{displayValue(post.description)}</dd>
                        </div>
                    </dl>

                    {actionError && (
                        <p role="alert" className="form-error">
                            {actionError}
                        </p>
                    )}

                    {post.is_owner ? (
                        <div className="row">
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => navigate(`/lost-edit/${id}`)}
                            >
                                공고 수정
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={handleDelete}
                                disabled={deleting}
                            >
                                {deleting ? "삭제 중..." : "공고 삭제"}
                            </button>

                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => navigate(`/lost-posts/${id}/matches`)}
                            >
                                AI 매칭 요청
                            </button>
                        </div>
                    ) : (
                        <div>
                            <button
                                type="button"
                                className={post.is_reported ? "btn btn-outline" : "btn btn-danger"}
                                onClick={handleReportButtonClick}
                            >
                                {post.is_reported ? "신고 완료" : "신고하기"}
                            </button>
                        </div>
                    )}
                </div>
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
                    onClose={() => setReportOpen(false)}
                    onSuccess={handleReportSuccess}
                />
            )}

            <AlertModal
                open={alertOpen}
                title={alertTitle}
                message={alertMessage}
                onConfirm={() => setAlertOpen(false)}
            />
        </div>
    )
}