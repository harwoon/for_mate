import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getMyLostPosts } from "../../api/misc.api.js"
import Badge from "../../components/common/Badge.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import Pagination from "../../components/common/Pagination.jsx"
import PostGrid from "../../components/post/PostGrid.jsx"

const PAGE_SIZE = 12

const STATUS_OPTIONS = [
    {
        value: "",
        label: "전체"
    },
    {
        value: "active",
        label: "게시중"
    },
    {
        value: "blind",
        label: "블라인드"
    }
]

function formatDate(value) {
    if (!value) return "-"

    return String(value)
        .slice(0, 10)
        .replaceAll("-", ".")
}

export default function MyLostPostsPage() {
    const navigate = useNavigate()

    const [posts, setPosts] = useState([])
    const [status, setStatus] = useState("")
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

    useEffect(() => {
        let cancelled = false

        async function loadPosts() {
            setLoading(true)
            setError("")

            try {
                const result = await getMyLostPosts({
                    page,
                    size: PAGE_SIZE,
                    status
                })

                if (cancelled) return

                setPosts(result?.items ?? [])

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
                    setPosts([])

                    setError(
                        error.message ||
                        "내 실종 공고를 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadPosts()

        return () => {
            cancelled = true
        }
    }, [
        page,
        status,
        retryCount
    ])

    function handleStatusChange(nextStatus) {
        setStatus(nextStatus)
        setPage(1)
    }

    return (
        <>
            {!error && (
                <Loading
                    loading={loading}
                    message="내 실종 공고를 불러오는 중입니다."
                />
            )}

            {!loading && error && (
                <ErrorState
                    message={error}
                    onRetry={() => (
                        setRetryCount(
                            (count) => count + 1
                        )
                    )}
                    onHome={() => navigate("/")}
                />
            )}

            {!error && (
                <div className="container">
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
                                label: "내 찾고있어요"
                            }
                        ]}
                    />

                    <div className="page-header">
                        <div>
                            <h1 className="page-title">
                                내 찾고있어요
                            </h1>

                            <p className="page-desc">
                                내가 등록한 실종 공고를 확인할 수 있습니다.
                            </p>
                        </div>
                    </div>

                    <div className="row-between">
                        <div className="row">
                            {STATUS_OPTIONS.map(
                                (option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={
                                            status === option.value
                                                ? "btn btn-primary"
                                                : "btn btn-outline"
                                        }
                                        onClick={() => (
                                            handleStatusChange(
                                                option.value
                                            )
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                )
                            )}
                        </div>

                        <span className="text-sub">
                            총 {pagination.total ?? 0}건
                        </span>
                    </div>

                    {!loading &&
                        posts.length === 0 && (
                            <Empty message="등록한 실종 공고가 없습니다." />
                        )}

                    {!loading &&
                        posts.length > 0 && (
                            <>
                                <PostGrid>
                                    {posts.map((post) => (
                                        <Link
                                            key={post.id}
                                            to={`/lost-posts/${post.id}`}
                                            className="post-card"
                                        >
                                            {post.primary_image_url && (
                                                <img
                                                    className="post-card-thumb"
                                                    src={imageUrl(
                                                        post.primary_image_url
                                                    )}
                                                    alt=""
                                                />
                                            )}

                                            <div className="post-card-body">
                                                <Badge type="lost">
                                                    {post.status === "blind"
                                                        ? "블라인드"
                                                        : "실종"}
                                                </Badge>

                                                <p className="post-card-title">
                                                    {post.pet_name ||
                                                    post.breed ||
                                                    post.species ||
                                                    "실종 동물"}
                                                </p>

                                                <p className="post-card-meta">
                                                    {post.breed ||
                                                    post.species ||
                                                    "품종 정보 없음"}
                                                </p>

                                                <p className="post-card-meta">
                                                    {post.region ||
                                                    "지역 정보 없음"}
                                                </p>

                                                <p className="post-card-meta">
                                                    실종일{" "}
                                                    {formatDate(
                                                        post.event_date
                                                    )}
                                                </p>

                                                <p className="post-card-meta">
                                                    AI 매칭{" "}
                                                    {post.match_count ?? 0}건
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </PostGrid>

                                <Pagination
                                    page={
                                        pagination.page ??
                                        page
                                    }
                                    total={
                                        pagination.total ??
                                        0
                                    }
                                    size={
                                        pagination.size ??
                                        PAGE_SIZE
                                    }
                                    onChange={setPage}
                                />
                            </>
                        )}
                </div>
            )}
        </>
    )
}