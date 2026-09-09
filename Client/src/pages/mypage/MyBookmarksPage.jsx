import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import {
    getBookmarks,
    removeBookmark
} from "../../api/misc.api.js"
import Badge from "../../components/common/Badge.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import Pagination from "../../components/common/Pagination.jsx"
import PostGrid from "../../components/post/PostGrid.jsx"

const PAGE_SIZE = 12

function formatDate(value) {
    if (!value) return "-"

    return String(value)
        .slice(0, 10)
        .replaceAll("-", ".")
}

function getDetailPath(bookmark) {
    return (
        `/rescue-animals/${bookmark.source_type}/${bookmark.animal_id}`
    )
}

export default function MyBookmarksPage() {
    const navigate = useNavigate()

    const [bookmarks, setBookmarks] = useState([])
    const [page, setPage] = useState(1)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [actionError, setActionError] = useState("")
    const [retryCount, setRetryCount] = useState(0)
    const [deletingId, setDeletingId] = useState(null)

    useEffect(() => {
        let cancelled = false

        async function loadBookmarks() {
            setLoading(true)
            setError("")

            try {
                const result = await getBookmarks()

                if (cancelled) return

                setBookmarks(
                    result?.items ?? []
                )
            } catch (error) {
                if (!cancelled) {
                    setBookmarks([])

                    setError(
                        error.message ||
                        "북마크 목록을 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadBookmarks()

        return () => {
            cancelled = true
        }
    }, [retryCount])

    const startIndex =
        (page - 1) * PAGE_SIZE

    const currentBookmarks =
        bookmarks.slice(
            startIndex,
            startIndex + PAGE_SIZE
        )

    async function handleRemove(bookmarkId) {
        const confirmed = window.confirm(
            "이 북마크를 삭제하시겠습니까?"
        )

        if (!confirmed) return

        setDeletingId(bookmarkId)
        setActionError("")

        try {
            await removeBookmark(bookmarkId)

            const nextBookmarks =
                bookmarks.filter(
                    (bookmark) => (
                        bookmark.bookmark_id !==
                        bookmarkId
                    )
                )

            setBookmarks(nextBookmarks)

            const lastPage = Math.max(
                1,
                Math.ceil(
                    nextBookmarks.length /
                    PAGE_SIZE
                )
            )

            if (page > lastPage) {
                setPage(lastPage)
            }
        } catch (error) {
            setActionError(
                error.message ||
                "북마크를 삭제하지 못했습니다."
            )
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <>
            {!error && (
                <Loading
                    loading={loading}
                    message="북마크 목록을 불러오는 중입니다."
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
                                label: "북마크"
                            }
                        ]}
                    />

                    <div className="page-header">
                        <div>
                            <h1 className="page-title">
                                북마크
                            </h1>

                            <p className="page-desc">
                                관심 있는 보호동물을
                                모아볼 수 있습니다.
                            </p>
                        </div>
                    </div>

                    <div className="row-between">
                        <span className="text-sub">
                            총 {bookmarks.length}건
                        </span>
                    </div>

                    {actionError && (
                        <p
                            className="form-error"
                            role="alert"
                        >
                            {actionError}
                        </p>
                    )}

                    {!loading &&
                        bookmarks.length === 0 && (
                            <Empty message="북마크한 보호동물이 없습니다." />
                        )}

                    {!loading &&
                        currentBookmarks.length > 0 && (
                            <>
                                <PostGrid>
                                    {currentBookmarks.map(
                                        (bookmark) => (
                                            <div
                                                key={
                                                    bookmark.bookmark_id
                                                }
                                                className="post-card"
                                            >
                                                {bookmark.is_expired ? (
                                                    <div>
                                                        {bookmark.thumbnail_url && (
                                                            <img
                                                                className="post-card-thumb"
                                                                src={imageUrl(
                                                                    bookmark.thumbnail_url
                                                                )}
                                                                alt=""
                                                            />
                                                        )}

                                                        <div className="post-card-body">
                                                            <Badge type="ending">
                                                                보호 종료
                                                            </Badge>

                                                            <p className="post-card-title">
                                                                {bookmark.breed ||
                                                                bookmark.species ||
                                                                "보호동물"}
                                                            </p>

                                                            <p className="post-card-meta">
                                                                {bookmark.region ||
                                                                bookmark.happen_place ||
                                                                "지역 정보 없음"}
                                                            </p>

                                                            <p className="post-card-meta">
                                                                공고 종료{" "}
                                                                {formatDate(
                                                                    bookmark.notice_end_date
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <Link
                                                        to={
                                                            getDetailPath(
                                                                bookmark
                                                            )
                                                        }
                                                    >
                                                        {bookmark.thumbnail_url && (
                                                            <img
                                                                className="post-card-thumb"
                                                                src={imageUrl(
                                                                    bookmark.thumbnail_url
                                                                )}
                                                                alt=""
                                                            />
                                                        )}

                                                        <div className="post-card-body">
                                                            <Badge type="rescue">
                                                                보호중
                                                            </Badge>

                                                            <p className="post-card-title">
                                                                {bookmark.breed ||
                                                                bookmark.species ||
                                                                "보호동물"}
                                                            </p>

                                                            <p className="post-card-meta">
                                                                {bookmark.region ||
                                                                bookmark.happen_place ||
                                                                "지역 정보 없음"}
                                                            </p>

                                                            <p className="post-card-meta">
                                                                공고 종료{" "}
                                                                {formatDate(
                                                                    bookmark.notice_end_date
                                                                )}
                                                            </p>
                                                        </div>
                                                    </Link>
                                                )}

                                                <button
                                                    type="button"
                                                    className="btn btn-outline"
                                                    onClick={() => (
                                                        handleRemove(
                                                            bookmark.bookmark_id
                                                        )
                                                    )}
                                                    disabled={
                                                        deletingId ===
                                                        bookmark.bookmark_id
                                                    }
                                                >
                                                    {deletingId ===
                                                    bookmark.bookmark_id
                                                        ? "삭제 중..."
                                                        : "북마크 삭제"}
                                                </button>
                                            </div>
                                        )
                                    )}
                                </PostGrid>

                                <Pagination
                                    page={page}
                                    total={
                                        bookmarks.length
                                    }
                                    size={PAGE_SIZE}
                                    onChange={setPage}
                                />
                            </>
                        )}
                </div>
            )}
        </>
    )
}