import { useEffect, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getMatches } from "../../api/matches.api.js"
import { getMyLostPosts } from "../../api/misc.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import { formatDate } from "../../utils/date.js"

const RETRY_INTERVAL = 2000
const MAX_RETRIES = 15
const INITIAL_MATCH_LIMIT = 8

const MATCHING_MESSAGES = [
    "등록한 이미지의 특징을 분석하고 있습니다.",
    "보호동물 이미지와 유사도를 비교하고 있습니다.",
    "유사한 보호동물 후보를 정리하고 있습니다."
]

export default function AiSearchPage() {
    const location = useLocation()
    const navigate = useNavigate()
    const initialPostId = location.state?.lostPostId
    const [posts, setPosts] = useState([])
    const [postsLoading, setPostsLoading] = useState(true)
    const [postsError, setPostsError] = useState("")
    const [reloadCount, setReloadCount] = useState(0)
    const [selectedPostId, setSelectedPostId] = useState("")
    const [matching, setMatching] = useState(false)
    const [waiting, setWaiting] = useState(false)
    const [delayed, setDelayed] = useState(false)
    const [matchError, setMatchError] = useState(null)
    const [failedImages, setFailedImages] = useState({})
    const [messageIndex, setMessageIndex] = useState(0)
    const runRef = useRef(0)
    const timerRef = useRef(null)
    const pendingRef = useRef(null)
    const matchingRef = useRef(false)

    useEffect(() => {
        let cancelled = false

        async function loadPosts() {
            setPostsLoading(true)
            setPostsError("")
            setMatching(false)
            setWaiting(false)
            setDelayed(false)
            setMatchError(null)

            try {
                const result = await getMyLostPosts({
                    page: 1,
                    size: 100
                })

                if (cancelled) return

                const items = result?.items ?? []

                setPosts(items)

                const initialPost = items.find(
                    (post) =>
                        String(post.id) ===
                        String(initialPostId)
                )

                setSelectedPostId(
                    initialPost
                        ? String(initialPost.id)
                        : ""
                )
            } catch (error) {
                if (!cancelled) {
                    setPostsError(
                        error.message ||
                        "내 실종 공고를 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setPostsLoading(false)
                }
            }
        }

        loadPosts()

        return () => {
            cancelled = true
            runRef.current += 1
            clearTimeout(timerRef.current)
            matchingRef.current = false
        }
    }, [initialPostId, reloadCount])

    useEffect(() => {
        if (!matching) {
            setMessageIndex(0)
            return
        }

        const interval = setInterval(() => {
            setMessageIndex((index) =>
                Math.min(
                    index + 1,
                    MATCHING_MESSAGES.length - 1
                )
            )
        }, 4000)

        return () => clearInterval(interval)
    }, [matching])

    function selectPost(id) {
        if (String(id) === selectedPostId) return

        runRef.current += 1
        clearTimeout(timerRef.current)
        matchingRef.current = false

        setSelectedPostId(String(id))
        setMatching(false)
        setWaiting(false)
        setDelayed(false)
        setMatchError(null)
    }

    async function startMatching() {
        if (!selectedPostId || matchingRef.current) return

        const run = ++runRef.current
        const postId = selectedPostId

        matchingRef.current = true

        clearTimeout(timerRef.current)

        setMatching(true)
        setWaiting(false)
        setDelayed(false)
        setMatchError(null)

        // 공고를 바꿔도 이미 전송한 요청이 끝날 때까지 기다려 동시 계산을 막는다.
        if (pendingRef.current) {
            await pendingRef.current.catch(() => {})
        }

        if (run !== runRef.current) return

        async function requestMatches(retries) {
            if (run !== runRef.current) return

            const request = getMatches(
                postId,
                {
                    limit: INITIAL_MATCH_LIMIT
                }
            )

            pendingRef.current = request

            try {
                const result = await request

                if (run !== runRef.current) return

                if (
                    !result ||
                    !Array.isArray(result.items)
                ) {
                    throw new Error(
                        "매칭 결과를 불러오지 못했습니다. 다시 시도해주세요."
                    )
                }

                navigate(
                    `/lost-posts/${postId}/matches`,
                    {
                        state: {
                            initialMatchResult: result
                        }
                    }
                )
            } catch (error) {
                if (run !== runRef.current) return

                if (
                    error.status === 409 &&
                    error.code === "EMBEDDINGS_NOT_READY"
                ) {
                    setWaiting(true)

                    if (retries < MAX_RETRIES) {
                        timerRef.current = setTimeout(
                            () =>
                                requestMatches(
                                    retries + 1
                                ),
                            RETRY_INTERVAL
                        )

                        return
                    }

                    setDelayed(true)
                } else {
                    setMatchError(error)
                }

                matchingRef.current = false
                setMatching(false)
            } finally {
                if (pendingRef.current === request) {
                    pendingRef.current = null
                }
            }
        }

        requestMatches(0)
    }

    const selectedPost = posts.find(
        (post) =>
            String(post.id) === selectedPostId
    )

    const canRetry =
        matchError &&
        ![400, 401, 403, 404].includes(
            matchError.status
        )

    return (
        <div className="container ai-search-page">
            <Breadcrumb
                items={[
                    {
                        label: "홈",
                        to: "/"
                    },
                    {
                        label: "AI로 찾기"
                    }
                ]}
            />

            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        AI로 찾기
                    </h1>

                    <p className="page-desc">
                        등록한 실종동물과 보호 중인 동물의 사진을 AI가 비교해 유사한 후보를 찾아드립니다.
                    </p>
                </div>
            </div>

            {postsLoading && (
                <Loading message="내 실종 공고를 불러오는 중입니다." />
            )}

            {!postsLoading && postsError && (
                <ErrorState
                    message={postsError}
                    onRetry={() =>
                        setReloadCount(
                            (count) => count + 1
                        )
                    }
                />
            )}

            {!postsLoading &&
                !postsError &&
                posts.length === 0 && (
                    <Empty
                        message="AI 매칭을 시작하려면 먼저 실종 공고를 등록해주세요."
                        action={
                            <Link
                                className="btn btn-primary"
                                to="/lost-posts/new"
                            >
                                실종 공고 등록하기
                            </Link>
                        }
                    />
                )}

            {!postsLoading &&
                !postsError &&
                posts.length > 0 && (
                    <div className="stack">
                        <section aria-labelledby="ai-select-title">
                            <div className="ai-section-heading">
                                <h2 id="ai-select-title">
                                    1. 실종동물 선택
                                </h2>

                                <p className="text-sub">
                                    AI로 찾고 싶은 실종동물 한 마리를 선택해주세요.
                                </p>
                            </div>

                            <div className="ai-post-grid">
                                {posts.map((post) => {
                                    const selected =
                                        String(post.id) ===
                                        selectedPostId

                                    return (
                                        <button
                                            key={post.id}
                                            type="button"
                                            className={`card ai-post-card${selected ? " is-selected" : ""}`}
                                            aria-pressed={selected}
                                            onClick={() =>
                                                selectPost(
                                                    post.id
                                                )
                                            }
                                        >
                                            {post.primary_image_url &&
                                            !failedImages[post.id] ? (
                                                <img
                                                    className="ai-post-image"
                                                    src={imageUrl(
                                                        post.primary_image_url
                                                    )}
                                                    alt={`${post.pet_name || "실종동물"} 대표 사진`}
                                                    onError={() =>
                                                        setFailedImages(
                                                            (
                                                                current
                                                            ) => ({
                                                                ...current,
                                                                [post.id]:
                                                                    true
                                                            })
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <span className="ai-post-image ai-image-empty">
                                                    <i
                                                        className="ri-image-line"
                                                        aria-hidden="true"
                                                    />
                                                    사진 없음
                                                </span>
                                            )}

                                            <span className="ai-post-info">
                                                <strong>
                                                    {post.pet_name ||
                                                        "실종동물"}
                                                </strong>

                                                <span className="text-sub">
                                                    {post.breed ||
                                                        post.species ||
                                                        "품종 정보 없음"}
                                                </span>

                                                <span className="text-sub">
                                                    {post.region ||
                                                        "지역 정보 없음"}
                                                </span>

                                                <span className="text-sub">
                                                    실종일{" "}
                                                    {formatDate(
                                                        post.event_date
                                                    )}
                                                </span>

                                                <span className="ai-selection-label">
                                                    {selected
                                                        ? "✓ 선택됨"
                                                        : "선택하기"}
                                                </span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </section>

                        <div className="card card-padded ai-match-action">
                            <p>
                                {selectedPost
                                    ? `${selectedPost.pet_name || "선택한 실종동물"}의 사진으로 AI 매칭을 시작합니다.`
                                    : "먼저 실종동물을 선택해주세요."}
                            </p>

                            <button
                                className="btn btn-primary"
                                disabled={
                                    !selectedPost ||
                                    matching
                                }
                                onClick={startMatching}
                            >
                                {matching
                                    ? "AI 매칭 진행 중"
                                    : "AI 매칭 시작"}
                            </button>
                        </div>

                        {matching && (
                            <section
                                className="card card-padded ai-analysis"
                                aria-labelledby="ai-analysis-title"
                            >
                                <div
                                    className="ai-analysis-loading"
                                    role="status"
                                    aria-live="polite"
                                >
                                    <div
                                        className="ai-loading-spinner"
                                        aria-hidden="true"
                                    />

                                    <h2 id="ai-analysis-title">
                                        AI가 유사한 보호동물을 찾고 있습니다.
                                    </h2>

                                    <div
                                        className="ai-progress-track"
                                        aria-hidden="true"
                                    >
                                        <div className="ai-progress-bar" />
                                    </div>

                                    <p className="ai-analysis-message">
                                        {
                                            MATCHING_MESSAGES[
                                                messageIndex
                                            ]
                                        }
                                    </p>

                                    <p className="text-sub ai-analysis-help">
                                        분석이 완료되면 매칭 결과로 자동 이동합니다.
                                    </p>
                                </div>
                            </section>
                        )}

                        {delayed && (
                            <div
                                className="card card-padded stack"
                                role="status"
                            >
                                <p>
                                    AI 분석 준비가 지연되고 있습니다. 잠시 후 다시 시도해주세요.
                                </p>

                                <div>
                                    <button
                                        className="btn btn-outline"
                                        onClick={startMatching}
                                    >
                                        다시 시도
                                    </button>
                                </div>
                            </div>
                        )}

                        {matchError && (
                            <div role="alert">
                                <ErrorState
                                    message={
                                        matchError.message ||
                                        "AI 매칭을 요청하지 못했습니다."
                                    }
                                    onRetry={
                                        canRetry
                                            ? startMatching
                                            : undefined
                                    }
                                />
                            </div>
                        )}
                    </div>
                )}
        </div>
    )
}