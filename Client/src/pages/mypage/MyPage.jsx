import { formatDate } from "../../utils/date.js"
import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getMySummary } from "../../api/misc.api.js"
import { useAuth } from "../../context/AuthContext.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import PostCard from "../../components/post/PostCard.jsx"
import PostGrid from "../../components/post/PostGrid.jsx"


function getBookmarkPath(bookmark) {
    if (
        bookmark.source_type &&
        bookmark.animal_id
    ) {
        return `/rescue-animals/${bookmark.source_type}/${bookmark.animal_id}`
    }

    return `/rescue-animals/${bookmark.desertion_no}`
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
                onRetry={() => (
                    setRetryCount(
                        (count) => count + 1
                    )
                )}
                onHome={() => navigate("/")}
            />
        )
    }

    const counts = summary?.counts ?? {}

    const recentLost =
        summary?.recent_lost_post

    const recentFound =
        summary?.recent_found_post

    const matchPreviews =
        summary?.match_previews ?? []

    const bookmarkPreviews =
        summary?.bookmark_previews ?? []

    return (
        <>
            {!error && (
                <Loading
                    loading={loading}
                    message="마이페이지 정보를 불러오는 중입니다."
                />
            )}

            {summary && (
                <div className="container">
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

                    <div className="page-header">
                        <h1 className="page-title">
                            마이페이지
                        </h1>

                        <p className="page-desc">
                            내가 등록한 공고와 매칭,
                            북마크 현황을 확인할 수 있습니다.
                        </p>

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

                    <section className="stack">
                        <h2>나의 활동</h2>

                        <div className="grid-3">
                            <div className="card card-padded">
                                <p className="text-sub">
                                    찾고있어요
                                </p>

                                <strong>
                                    {counts.lost_posts ?? 0}건
                                </strong>
                            </div>

                            <div className="card card-padded">
                                <p className="text-sub">
                                    발견제보
                                </p>

                                <strong>
                                    {counts.found_posts ?? 0}건
                                </strong>
                            </div>

                            <div className="card card-padded">
                                <p className="text-sub">
                                    AI 매칭
                                </p>

                                <strong>
                                    {counts.matches ?? 0}건
                                </strong>
                            </div>

                            <div className="card card-padded">
                                <p className="text-sub">
                                    북마크
                                </p>

                                <strong>
                                    {counts.bookmarks ?? 0}건
                                </strong>
                            </div>

                            <div className="card card-padded">
                                <p className="text-sub">
                                    문의
                                </p>

                                <strong>
                                    {counts.inquiries ?? 0}건
                                </strong>
                            </div>

                            <div className="card card-padded">
                                <p className="text-sub">
                                    답변 완료
                                </p>

                                <strong>
                                    {counts.answered_inquiries ?? 0}건
                                </strong>
                            </div>
                            <Link
                                to="/mypage/inquiries"
                                className="btn btn-outline"
                            >
                                내 문의글 보러가기
                            </Link>
                        </div>
                    </section>

                    <section className="stack">
                        <h2>최근 등록한 글</h2>

                        <div className="grid-2">
                            <div className="card card-padded stack">
                                <div className="row-between">
                                    <h3>
                                        찾고있어요
                                    </h3>

                                    <Link
                                        to="/mypage/lost-posts"
                                        className="text-sub"
                                    >
                                        전체보기 →
                                    </Link>
                                </div>

                                {recentLost ? (
                                    <Link
                                        to={`/lost-posts/${recentLost.id}`}
                                        className="stack"
                                    >
                                        {recentLost.primary_image_url && (
                                            <img
                                                src={imageUrl(
                                                    recentLost.primary_image_url
                                                )}
                                                alt=""
                                            />
                                        )}

                                        <strong>
                                            {recentLost.pet_name ||
                                            recentLost.breed ||
                                            "실종 동물"}
                                        </strong>

                                        <span className="text-sub">
                                            {recentLost.region || "-"}
                                        </span>

                                        <span className="text-sub">
                                            {formatDate(
                                                recentLost.event_date
                                            )}
                                        </span>
                                    </Link>
                                ) : (
                                    <Empty message="등록한 실종 공고가 없습니다." />
                                )}
                            </div>

                            <div className="card card-padded stack">
                                <div className="row-between">
                                    <h3>
                                        발견제보
                                    </h3>

                                    <Link
                                        to="/mypage/found-posts"
                                        className="text-sub"
                                    >
                                        전체보기 →
                                    </Link>
                                </div>

                                {recentFound ? (
                                    <Link
                                        to={`/found-posts/${recentFound.id}`}
                                        className="stack"
                                    >
                                        {recentFound.primary_image_url && (
                                            <img
                                                src={imageUrl(
                                                    recentFound.primary_image_url
                                                )}
                                                alt=""
                                            />
                                        )}

                                        <strong>
                                            {recentFound.title ||
                                            recentFound.breed ||
                                            "발견 동물"}
                                        </strong>

                                        <span className="text-sub">
                                            {recentFound.region || "-"}
                                        </span>

                                        <span className="text-sub">
                                            {formatDate(
                                                recentFound.find_date
                                            )}
                                        </span>
                                    </Link>
                                ) : (
                                    <Empty message="등록한 발견제보가 없습니다." />
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="stack">
                        <div className="row-between">
                            <h2>AI 매칭 결과</h2>

                            <span className="text-sub">
                                {counts.matches ?? 0}건
                            </span>
                        </div>

                        {matchPreviews.length === 0 ? (
                            <Empty message="아직 AI 매칭 결과가 없습니다." />
                        ) : (
                            <div className="grid-3">
                                {matchPreviews.map((match) => (
                                    <Link
                                        key={match.match_id}
                                        to={`/matches/${match.match_id}`}
                                        className="card card-padded stack"
                                    >
                                        {match.thumbnail_url && (
                                            <img
                                                src={imageUrl(
                                                    match.thumbnail_url
                                                )}
                                                alt=""
                                            />
                                        )}

                                        <strong>
                                            유사도{" "}
                                            {Math.round(
                                                Number(
                                                    match.similarity_score
                                                ) * 100
                                            )}
                                            %
                                        </strong>

                                        <span className="text-sub">
                                            구조동물 번호{" "}
                                            {match.desertion_no}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="stack">
                        <div className="row-between">
                            <h2>북마크</h2>
                            <Link
                                to="/mypage/bookmarks"
                                className="text-sub"
                            >
                                전체보기 →
                            </Link>
                        </div>

                        {bookmarkPreviews.length === 0 ? (
                            <Empty message="북마크한 구조동물이 없습니다." />
                        ) : (
                            <PostGrid>
                                {bookmarkPreviews.map(
                                    (bookmark) => (
                                        <PostCard
                                            key={
                                                bookmark.bookmark_id
                                            }
                                            to={
                                                getBookmarkPath(
                                                    bookmark
                                                )
                                            }
                                            thumbnail={
                                                imageUrl(
                                                    bookmark.thumbnail_url ||
                                                    bookmark.image_url
                                                )
                                            }
                                            badgeType={
                                                bookmark.is_expired
                                                    ? "ending"
                                                    : "rescue"
                                            }
                                            badgeText={
                                                bookmark.is_expired
                                                    ? "보호 종료"
                                                    : "북마크"
                                            }
                                            breed={
                                                bookmark.breed ||
                                                bookmark.species
                                            }
                                            region={
                                                bookmark.region ||
                                                bookmark.happen_place ||
                                                "-"
                                            }
                                            date={
                                                bookmark.notice_end_date ||
                                                "-"
                                            }
                                        />
                                    )
                                )}
                            </PostGrid>
                        )}
                    </section>
                </div>
            )}
        </>
    )
}