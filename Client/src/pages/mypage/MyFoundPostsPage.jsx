import { formatDate } from "../../utils/date.js"
import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getMyFoundPosts } from "../../api/misc.api.js"
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

export default function MyFoundPostsPage() {
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
                const result = await getMyFoundPosts({
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
                        "내 발견제보를 불러오지 못했습니다."
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
                    message="내 발견제보를 불러오는 중입니다."
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
                                label: "내 발견제보"
                            }
                        ]}
                    />

                    <div className="page-header">
                        <div>
                            <h1 className="page-title">
                                내 발견제보
                            </h1>

                            <p className="page-desc">
                                내가 등록한 발견제보를 확인할 수 있습니다.
                            </p>
                        </div>
                    </div>

                    <div className="row-between">
                        <div className="row">
                            {STATUS_OPTIONS.map((option) => (
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
                            ))}
                        </div>

                        <span className="text-sub">
                            총 {pagination.total ?? 0}건
                        </span>
                    </div>

                    {!loading &&
                        posts.length === 0 && (
                            <Empty message="등록한 발견제보가 없습니다." />
                        )}

                    {!loading &&
                        posts.length > 0 && (
                            <>
                                <PostGrid>
                                    {posts.map((post) => (
                                        <Link
                                            key={post.id}
                                            to={`/found-posts/${post.id}`}
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
                                                <span className="badge">
                                                    {post.status === "blind"
                                                        ? "블라인드"
                                                        : "발견제보"}
                                                </span>

                                                <p className="post-card-title">
                                                    {post.title ||
                                                    post.breed ||
                                                    post.species ||
                                                    "발견 동물"}
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
                                                    발견일{" "}
                                                    {formatDate(
                                                        post.find_date
                                                    )}
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