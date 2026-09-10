import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getMySummary } from "../../api/misc.api.js"
import { useAuth } from "../../context/AuthContext.jsx"
import Badge from "../../components/common/Badge.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import { formatDate } from "../../utils/date.js"

function getBookmarkPath(bookmark) {
    if (bookmark.source_type && bookmark.animal_id) {
        return `/rescue-animals/${bookmark.source_type}/${bookmark.animal_id}`
    }

    return `/rescue-animals/${bookmark.desertion_no}`
}

function PreviewImage({ src, alt = "" }) {
    const [failed, setFailed] = useState(false)

    if (!src || failed) {
        return (
            <span className="mypage-preview-image is-empty">
                <i className="ri-image-line" aria-hidden="true" />
            </span>
        )
    }

    return (
        <img
            className="mypage-preview-image"
            src={imageUrl(src)}
            alt={alt}
            onError={() => setFailed(true)}
        />
    )
}

export default function MyPage() {
    const navigate = useNavigate()
    const { logout } = useAuth()

    const [summary, setSummary] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function loadSummary() {
            setLoading(true)
            setError("")

            try {
                const result = await getMySummary()

                if (cancelled) return

                setSummary(result)
            } catch (error) {
                if (!cancelled) {
                    setSummary(null)
                    setError(
                        error.message ||
                        "마이페이지 정보를 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadSummary()

        return () => {
            cancelled = true
        }
    }, [retryCount])

    if (error) {
        return (
            <ErrorState
                message={error}
                onRetry={() => setRetryCount((count) => count + 1)}
                onHome={() => navigate("/")}
            />
        )
    }

    const counts = summary?.counts ?? {}
    const recentLost = summary?.recent_lost_post
    const recentFound = summary?.recent_found_post
    const matchPreviews = summary?.match_previews ?? []
    const bookmarkPreviews = summary?.bookmark_previews ?? []

    return (
        <>
            {!error && (
                <Loading
                    loading={loading}
                    message="마이페이지 정보를 불러오는 중입니다."
                />
            )}

            {summary && (
                <div className="container mypage-home">
                    <Breadcrumb
                        items={[
                            {
                                label: "홈",
                                to: "/"
                            },
                            {
                                label: "마이페이지"
                            }
                        ]}
                    />

                    <div className="page-header mypage-header">
                        <div>
                            <h1 className="page-title">
                                마이페이지
                            </h1>

                            <p className="page-desc">
                                내가 등록한 공고와 AI 매칭,
                                북마크 현황을 확인할 수 있습니다.
                            </p>
                        </div>

                        <div className="mypage-header-actions">
                            <Link
                                to="/mypage/inquiries"
                                className="btn btn-outline"
                            >
                                내 문의글
                            </Link>

                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={async () => {
                                    await logout()
                                    navigate("/")
                                }}
                            >
                                로그아웃
                            </button>
                        </div>
                    </div>

                    <section
                        className="card mypage-stats"
                        aria-label="나의 활동 요약"
                    >
                        <div className="mypage-stat">
                            <span>실종 등록</span>

                            <strong>
                                {counts.lost_posts ?? 0}
                                <small>건</small>
                            </strong>
                        </div>

                        <div className="mypage-stat">
                            <span>발견제보</span>

                            <strong>
                                {counts.found_posts ?? 0}
                                <small>건</small>
                            </strong>
                        </div>

                        <div className="mypage-stat">
                            <span>AI 매칭 결과</span>

                            <strong>
                                {counts.matches ?? 0}
                                <small>건</small>
                            </strong>
                        </div>

                        <div className="mypage-stat">
                            <span>북마크</span>

                            <strong>
                                {counts.bookmarks ?? 0}
                                <small>건</small>
                            </strong>
                        </div>
                    </section>

                    <section className="mypage-home-section">
                        <div className="mypage-section-header">
                            <h2>내 실종 등록</h2>

                            <Link
                                to="/mypage/lost-posts"
                                className="mypage-more-link"
                            >
                                전체보기
                                <i
                                    className="ri-arrow-right-s-line"
                                    aria-hidden="true"
                                />
                            </Link>
                        </div>

                        {recentLost ? (
                            <div className="card mypage-recent-card">
                                <Link
                                    to={`/lost-posts/${recentLost.id}`}
                                    className="mypage-recent-main"
                                >
                                    <PreviewImage
                                        src={recentLost.primary_image_url}
                                        alt={`${recentLost.pet_name || "실종동물"} 사진`}
                                    />

                                    <div className="mypage-recent-info">
                                        <div className="mypage-recent-title">
                                            <Badge type="lost">
                                                {recentLost.status === "blind"
                                                    ? "블라인드"
                                                    : "찾는 중"}
                                            </Badge>

                                            <strong>
                                                {recentLost.pet_name ||
                                                    recentLost.breed ||
                                                    recentLost.species ||
                                                    "실종동물"}
                                            </strong>
                                        </div>

                                        <p>
                                            {formatDate(
                                                recentLost.event_date,
                                                "-"
                                            )}
                                            {" 실종 · "}
                                            {recentLost.region || "지역 정보 없음"}
                                        </p>

                                        <span>
                                            AI 매칭 결과{" "}
                                            <strong>
                                                {recentLost.match_count ?? 0}건
                                            </strong>
                                        </span>
                                    </div>
                                </Link>

                                <Link
                                    to={`/lost-posts/${recentLost.id}`}
                                    className="btn btn-primary mypage-detail-button"
                                >
                                    상세보기
                                </Link>
                            </div>
                        ) : (
                            <div className="card mypage-home-empty">
                                <i
                                    className="ri-search-eye-line"
                                    aria-hidden="true"
                                />

                                <p>
                                    아직 등록한 실종 공고가 없습니다.
                                </p>

                                <Link
                                    to="/lost-posts/new"
                                    className="btn btn-primary"
                                >
                                    실종 공고 등록하기
                                </Link>
                            </div>
                        )}
                    </section>

                    <section className="mypage-home-section">
                        <div className="mypage-section-header">
                            <h2>내 발견제보</h2>

                            <Link
                                to="/mypage/found-posts"
                                className="mypage-more-link"
                            >
                                전체보기
                                <i
                                    className="ri-arrow-right-s-line"
                                    aria-hidden="true"
                                />
                            </Link>
                        </div>

                        {recentFound ? (
                            <div className="card mypage-recent-card">
                                <Link
                                    to={`/found-posts/${recentFound.id}`}
                                    className="mypage-recent-main"
                                >
                                    <PreviewImage
                                        src={recentFound.primary_image_url}
                                        alt={`${recentFound.title || "발견동물"} 사진`}
                                    />

                                    <div className="mypage-recent-info">
                                        <div className="mypage-recent-title">
                                            <Badge type="rescue">
                                                보호 중
                                            </Badge>

                                            <strong>
                                                {recentFound.title ||
                                                    recentFound.breed ||
                                                    recentFound.species ||
                                                    "발견동물"}
                                            </strong>
                                        </div>

                                        <p>
                                            {formatDate(
                                                recentFound.find_date,
                                                "-"
                                            )}
                                            {" 발견 · "}
                                            {recentFound.region || "지역 정보 없음"}
                                        </p>
                                    </div>
                                </Link>

                                <Link
                                    to={`/found-posts/${recentFound.id}`}
                                    className="btn btn-primary mypage-detail-button"
                                >
                                    상세보기
                                </Link>
                            </div>
                        ) : (
                            <div className="card mypage-home-empty">
                                <i
                                    className="ri-map-pin-line"
                                    aria-hidden="true"
                                />

                                <p>
                                    아직 등록한 발견제보가 없습니다.
                                </p>

                                <Link
                                    to="/found-posts/new"
                                    className="btn btn-primary"
                                >
                                    발견제보 등록하기
                                </Link>
                            </div>
                        )}
                    </section>

                    <div className="mypage-summary-grid">
                        <section className="card card-padded mypage-summary-card">
                            <div className="mypage-section-header">
                                <h2>AI 매칭 결과</h2>

                                <Link
                                    to="/mypage/matches"
                                    className="mypage-more-link"
                                >
                                    전체보기
                                    <i
                                        className="ri-arrow-right-s-line"
                                        aria-hidden="true"
                                    />
                                </Link>
                            </div>

                            <strong className="mypage-summary-count">
                                총 {counts.matches ?? 0}건
                            </strong>

                            {matchPreviews.length > 0 ? (
                                <div className="mypage-thumbnail-list">
                                    {matchPreviews
                                        .slice(0, 6)
                                        .map((match) => (
                                            <Link
                                                key={match.match_id}
                                                to={`/matches/${match.match_id}`}
                                                className="mypage-thumbnail-link"
                                                aria-label="AI 매칭 상세 비교"
                                            >
                                                <PreviewImage
                                                    src={match.thumbnail_url}
                                                />
                                            </Link>
                                        ))}
                                </div>
                            ) : (
                                <p className="mypage-summary-empty">
                                    아직 AI 매칭 결과가 없습니다.
                                </p>
                            )}

                            <p className="mypage-summary-description">
                                등록한 실종동물의 AI 매칭 결과를
                                다시 확인할 수 있습니다.
                            </p>
                        </section>

                        <section className="card card-padded mypage-summary-card">
                            <div className="mypage-section-header">
                                <h2>북마크</h2>

                                <Link
                                    to="/mypage/bookmarks"
                                    className="mypage-more-link"
                                >
                                    전체보기
                                    <i
                                        className="ri-arrow-right-s-line"
                                        aria-hidden="true"
                                    />
                                </Link>
                            </div>

                            <strong className="mypage-summary-count">
                                총 {counts.bookmarks ?? 0}건
                            </strong>

                            {bookmarkPreviews.length > 0 ? (
                                <div className="mypage-thumbnail-list">
                                    {bookmarkPreviews
                                        .slice(0, 6)
                                        .map((bookmark) => (
                                            <Link
                                                key={bookmark.bookmark_id}
                                                to={getBookmarkPath(
                                                    bookmark
                                                )}
                                                className="mypage-thumbnail-link"
                                                aria-label="북마크한 보호동물 보기"
                                            >
                                                <PreviewImage
                                                    src={
                                                        bookmark.thumbnail_url ||
                                                        bookmark.image_url
                                                    }
                                                />
                                            </Link>
                                        ))}
                                </div>
                            ) : (
                                <p className="mypage-summary-empty">
                                    아직 북마크한 보호동물이 없습니다.
                                </p>
                            )}

                            <p className="mypage-summary-description">
                                관심 있는 보호동물 공고를
                                모아볼 수 있습니다.
                            </p>
                        </section>
                    </div>
                </div>
            )}
        </>
    )
}