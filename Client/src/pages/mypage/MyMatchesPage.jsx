import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getMyLostPosts, getMyMatches } from "../../api/misc.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import Pagination from "../../components/common/Pagination.jsx"

const PAGE_SIZE = 10

const SOURCE_LABELS = {
    rescue: "공공데이터",
    pawinhand: "포인핸드"
}

function formatSimilarity(value) {
    const similarity = Number(value)

    if (!Number.isFinite(similarity)) return "-"

    return `${(similarity * 100).toFixed(1)}%`
}

function formatMatchDate(value) {
    if (!value) return "정보 없음"

    const text = String(value)
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/)

    if (!match) return "정보 없음"

    return `${match[1]}.${match[2]}.${match[3]}`
}

export default function MyMatchesPage() {
    const navigate = useNavigate()

    const [matches, setMatches] = useState([])
    const [lostPosts, setLostPosts] = useState([])
    const [lostPostId, setLostPostId] = useState("")
    const [page, setPage] = useState(1)
    const [pagination, setPagination] = useState({
        page: 1,
        size: PAGE_SIZE,
        total: 0,
        total_pages: 0
    })

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryCount, setRetryCount] = useState(0)
    const [failedImages, setFailedImages] = useState({})

    useEffect(() => {
        let cancelled = false

        async function loadLostPosts() {
            try {
                const result = await getMyLostPosts({
                    page: 1,
                    size: 100
                })

                if (cancelled) return

                setLostPosts(result?.items ?? [])
            } catch {
                if (!cancelled) {
                    setLostPosts([])
                }
            }
        }

        loadLostPosts()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        async function loadMatches() {
            setLoading(true)
            setError("")

            try {
                const params = {
                    page,
                    size: PAGE_SIZE
                }

                if (lostPostId) {
                    params.lost_post_id = lostPostId
                }

                const result = await getMyMatches(params)

                if (cancelled) return

                setMatches(result?.items ?? [])

                setPagination(
                    result?.pagination ?? {
                        page,
                        size: PAGE_SIZE,
                        total: 0,
                        total_pages: 0
                    }
                )
            } catch (error) {
                if (!cancelled) {
                    setMatches([])
                    setError(
                        error.message ||
                        "AI 매칭 결과를 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadMatches()

        return () => {
            cancelled = true
        }
    }, [
        page,
        lostPostId,
        retryCount
    ])

    function handleLostPostChange(event) {
        setLostPostId(event.target.value)
        setPage(1)
    }

    return (
        <div className="container my-matches-page">
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
                        label: "AI 매칭 결과"
                    }
                ]}
            />

            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        AI 매칭 결과
                    </h1>

                    <p className="page-desc">
                        내 실종동물과 유사하게 분석된 보호동물 후보를 다시 확인할 수 있습니다.
                    </p>
                </div>
            </div>

            <div className="card card-padded my-match-toolbar">
                <div className="my-match-filter">
                    <label htmlFor="my-match-lost-post">
                        실종동물
                    </label>

                    <select
                        id="my-match-lost-post"
                        value={lostPostId}
                        onChange={handleLostPostChange}
                    >
                        <option value="">
                            전체 실종동물
                        </option>

                        {lostPosts.map((post) => (
                            <option
                                key={post.id}
                                value={post.id}
                            >
                                {post.pet_name ||
                                    post.breed ||
                                    post.species ||
                                    "실종동물"}
                            </option>
                        ))}
                    </select>
                </div>

                <span className="text-sub">
                    총 {pagination.total ?? 0}건
                </span>
            </div>

            {loading && (
                <Loading message="AI 매칭 결과를 불러오는 중입니다." />
            )}

            {!loading && error && (
                <ErrorState
                    message={error}
                    onRetry={() =>
                        setRetryCount(
                            (count) => count + 1
                        )
                    }
                    onHome={() => navigate("/")}
                />
            )}

            {!loading &&
                !error &&
                matches.length === 0 && (
                    <Empty message="아직 AI 매칭 결과가 없습니다." />
                )}

            {!loading &&
                !error &&
                matches.length > 0 && (
                    <>
                        <div className="my-match-list">
                            {matches.map((match) => {
                                const animal =
                                    match.animal ?? {}

                                const lostPost =
                                    match.lost_post ?? {}

                                const sourceLabel =
                                    SOURCE_LABELS[
                                        animal.source_type
                                    ] || "보호동물 데이터"

                                const candidateName =
                                    animal.kind_nm ||
                                    animal.up_kind_nm ||
                                    "보호동물"

                                const lostName =
                                    lostPost.pet_name ||
                                    lostPost.species ||
                                    "실종동물"

                                return (
                                    <article
                                        key={match.id}
                                        className="card my-match-history-card"
                                    >
                                        <div className="my-match-image">
                                            {animal.image_url &&
                                            !failedImages[match.id] ? (
                                                <img
                                                    src={imageUrl(
                                                        animal.image_url
                                                    )}
                                                    alt={`${candidateName} 사진`}
                                                    onError={() =>
                                                        setFailedImages(
                                                            (current) => ({
                                                                ...current,
                                                                [match.id]: true
                                                            })
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <div className="my-match-image-placeholder">
                                                    <i
                                                        className="ri-image-line"
                                                        aria-hidden="true"
                                                    />
                                                    <span>
                                                        사진 없음
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="my-match-history-body">
                                            <div className="my-match-badges">
                                                <span className="my-match-source-badge">
                                                    {sourceLabel}
                                                </span>

                                                <span className="my-match-lost-badge">
                                                    {lostName}와 매칭
                                                </span>
                                            </div>

                                            <h2>
                                                {candidateName}
                                            </h2>

                                            <div className="my-match-history-meta">
                                                <div>
                                                    <span>
                                                        AI 이미지 유사도
                                                    </span>

                                                    <strong>
                                                        {formatSimilarity(
                                                            match.similarity_score
                                                        )}
                                                    </strong>
                                                </div>

                                                <div>
                                                    <span>
                                                        매칭일
                                                    </span>

                                                    <strong>
                                                        {formatMatchDate(
                                                            match.matched_date
                                                        )}
                                                    </strong>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="my-match-history-action">
                                            <Link
                                                to={`/matches/${match.id}`}
                                                className="btn btn-primary"
                                            >
                                                상세 비교
                                            </Link>
                                        </div>
                                    </article>
                                )
                            })}
                        </div>

                        <Pagination
                            page={pagination.page ?? page}
                            total={pagination.total ?? 0}
                            size={pagination.size ?? PAGE_SIZE}
                            onChange={setPage}
                        />
                    </>
                )}
        </div>
    )
}