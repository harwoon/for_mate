import { formatDate } from "../../utils/date.js"
import { formatTimestampDate } from "../../utils/date.js"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getAdminFoundPosts } from "../../api/admin.api.js"

const PAGE_SIZE = 15

function getStatusLabel(status) {
    if (status === "blind") return "블라인드"
    return "활성"
}

export default function AdminFoundPostsPage() {
    const [status, setStatus] = useState("")
    const [keyword, setKeyword] = useState("")
    const [posts, setPosts] = useState([])
    const [page, setPage] = useState(1)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function loadPosts() {
            setLoading(true)
            setError("")

            try {
                const result = await getAdminFoundPosts({
                    status
                })

                if (cancelled) return

                setPosts(
                    Array.isArray(result)
                        ? result
                        : []
                )

                setPage(1)
            } catch (error) {
                if (!cancelled) {
                    setPosts([])

                    setError(
                        error.message ||
                        "발견제보 목록을 불러오지 못했습니다."
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
        status,
        retryCount
    ])

    const filteredPosts = useMemo(() => {
        const searchKeyword =
            keyword.trim().toLowerCase()

        if (!searchKeyword) {
            return posts
        }

        return posts.filter((post) => {
            const values = [
                post.id,
                post.user_id,
                post.title,
                post.species,
                post.breed,
                post.region
            ]

            return values.some((value) => (
                String(value ?? "")
                    .toLowerCase()
                    .includes(searchKeyword)
            ))
        })
    }, [
        posts,
        keyword
    ])

    const totalPages = Math.max(
        1,
        Math.ceil(
            filteredPosts.length / PAGE_SIZE
        )
    )

    const currentPage = Math.min(
        page,
        totalPages
    )

    const visiblePosts = filteredPosts.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    )

    function handleKeywordChange(event) {
        setKeyword(event.target.value)
        setPage(1)
    }

    function handleStatusChange(nextStatus) {
        setStatus(nextStatus)
        setPage(1)
    }

    return (
        <div className="admin-page">
            <div className="admin-page-heading">
                <h2>
                    발견제보
                </h2>

                <p>
                    등록된 발견제보의 상태와 기본 정보를 확인합니다.
                </p>
            </div>

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
                            onClick={() => (
                                handleStatusChange("")
                            )}
                        >
                            전체
                        </button>

                        <button
                            type="button"
                            className={
                                status === "active"
                                    ? "admin-status-tab is-active"
                                    : "admin-status-tab"
                            }
                            onClick={() => (
                                handleStatusChange("active")
                            )}
                        >
                            활성
                        </button>

                        <button
                            type="button"
                            className={
                                status === "blind"
                                    ? "admin-status-tab is-active"
                                    : "admin-status-tab"
                            }
                            onClick={() => (
                                handleStatusChange("blind")
                            )}
                        >
                            블라인드
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
                            placeholder="제목, 품종, 지역, 게시글 ID 검색"
                            onChange={handleKeywordChange}
                        />
                    </div>
                </div>

                <div className="admin-list-summary">
                    <span>
                        총{" "}
                        <strong>
                            {filteredPosts.length}
                        </strong>
                        건
                    </span>
                </div>

                {loading && (
                    <div className="admin-list-state">
                        <i
                            className="ri-loader-4-line admin-spin"
                            aria-hidden="true"
                        />

                        <span>
                            발견제보를 불러오는 중입니다.
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
                                setRetryCount(
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
                    filteredPosts.length === 0 && (
                        <div className="admin-list-state">
                            <i
                                className="ri-file-search-line"
                                aria-hidden="true"
                            />

                            <span>
                                조건에 맞는 발견제보가 없습니다.
                            </span>
                        </div>
                    )}

                {!loading &&
                    !error &&
                    filteredPosts.length > 0 && (
                        <>
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>게시글</th>
                                            <th>동물 정보</th>
                                            <th>지역</th>
                                            <th>발견일</th>
                                            <th>작성자</th>
                                            <th>상태</th>
                                            <th>등록일</th>
                                            <th>관리</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {visiblePosts.map(
                                            (post) => (
                                                <tr key={post.id}>
                                                    <td className="admin-table-id">
                                                        #{post.id}
                                                    </td>

                                                    <td>
                                                        <div className="admin-post-cell">
                                                            {post.primary_image_url ? (
                                                                <img
                                                                    src={imageUrl(
                                                                        post.primary_image_url
                                                                    )}
                                                                    alt=""
                                                                    className="admin-post-thumbnail"
                                                                />
                                                            ) : (
                                                                <div className="admin-post-thumbnail is-empty">
                                                                    <i
                                                                        className="ri-image-line"
                                                                        aria-hidden="true"
                                                                    />
                                                                </div>
                                                            )}

                                                            <strong>
                                                                {post.title ||
                                                                    "제목 없음"}
                                                            </strong>
                                                        </div>
                                                    </td>

                                                    <td>
                                                        <div className="admin-table-main">
                                                            <strong>
                                                                {post.breed ||
                                                                    post.species ||
                                                                    "-"}
                                                            </strong>

                                                            <span>
                                                                {post.species ||
                                                                    "-"}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    <td>
                                                        {post.region ||
                                                            "-"}
                                                    </td>

                                                    <td>
                                                        {formatDate(
                                                            post.find_date
                                                        )}
                                                    </td>

                                                    <td>
                                                        <span className="admin-user-id">
                                                            USER #{post.user_id}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        <span
                                                            className={
                                                                post.status === "blind"
                                                                    ? "admin-status-badge is-blind"
                                                                    : "admin-status-badge is-active"
                                                            }
                                                        >
                                                            {getStatusLabel(
                                                                post.status
                                                            )}
                                                        </span>
                                                    </td>

                                                    <td className="admin-table-date">
                                                        {formatTimestampDate(
                                                            post.created_at
                                                        )}
                                                    </td>

                                                    <td>
                                                        <Link
                                                            to={`/found-posts/${post.id}`}
                                                            className="admin-view-button"
                                                        >
                                                            <i
                                                                className="ri-eye-line"
                                                                aria-hidden="true"
                                                            />

                                                            보기
                                                        </Link>
                                                    </td>
                                                </tr>
                                            )
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div className="admin-table-pagination">
                                    <button
                                        type="button"
                                        disabled={
                                            currentPage === 1
                                        }
                                        onClick={() => (
                                            setPage(
                                                currentPage - 1
                                            )
                                        )}
                                        aria-label="이전 페이지"
                                    >
                                        <i
                                            className="ri-arrow-left-s-line"
                                            aria-hidden="true"
                                        />
                                    </button>

                                    <span>
                                        <strong>
                                            {currentPage}
                                        </strong>
                                        {" / "}
                                        {totalPages}
                                    </span>

                                    <button
                                        type="button"
                                        disabled={
                                            currentPage === totalPages
                                        }
                                        onClick={() => (
                                            setPage(
                                                currentPage + 1
                                            )
                                        )}
                                        aria-label="다음 페이지"
                                    >
                                        <i
                                            className="ri-arrow-right-s-line"
                                            aria-hidden="true"
                                        />
                                    </button>
                                </div>
                            )}
                        </>
                    )}
            </section>
        </div>
    )
}