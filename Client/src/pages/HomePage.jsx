import { formatRelativeTime } from "../utils/date.js"
﻿import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { imageUrl } from "../api/client.js"
import { getLostPosts } from "../api/lostPosts.api.js"
import { getRescueAnimals } from "../api/rescueAnimals.api.js"
import { getFoundPosts } from "../api/foundPosts.api.js"
import PostCard from "../components/post/PostCard.jsx"
import PostGrid from "../components/post/PostGrid.jsx"
import Loading from "../components/common/Loading.jsx"
import ErrorState from "../components/common/ErrorState.jsx"
import Empty from "../components/common/Empty.jsx"

const SECTIONS = [
    { key: "lost", title: "찾고있어요", description: "가족의 품으로 돌아갈 수 있도록 함께 찾아주세요.", to: "/lost-posts", request: getLostPosts },
    { key: "rescue", title: "보호중이에요", description: "보호 중인 동물들의 소식을 확인해 보세요.", to: "/rescue-animals", request: getRescueAnimals },
    { key: "found", title: "발견제보", description: "작은 목격 정보가 가족을 찾는 데 도움이 됩니다.", to: "/found-posts", request: getFoundPosts }
]

const LOADING_DELAY = 250
const MIN_LOADING_VISIBLE = 280

// RescueListPage의 출처별 경로와 기존 공고번호 호환 경로를 유지한다.
function getRescueDetailPath(animal) {
    if (animal.source_type && animal.animal_id) {
        return `/rescue-animals/${animal.source_type}/${animal.animal_id}`
    }

    return `/rescue-animals/${animal.desertion_no}`
}

function renderCard(type, item) {
    if (type === "found") {
        return (
            <Link key={item.id} to={`/found-posts/${item.id}`} className="home-found-row">
                <span className="home-found-title">{item.title || "제목 없음"}</span>
                <span className="home-found-region">{item.region || "-"}</span>
                <time className="home-found-date" dateTime={item.created_at || undefined}>
                    {formatRelativeTime(item.created_at)}
                </time>
            </Link>
        )
    }

    if (type === "rescue") {
        const days = Number(item.days_until_end)
        const endingSoon = Number.isFinite(days) && days >= 0 && days <= 3
        const to = getRescueDetailPath(item)

        return (
            <PostCard
                key={to}
                to={to}
                thumbnail={imageUrl(item.image_url)}
                badgeType={endingSoon ? "ending" : "rescue"}
                badgeText={endingSoon ? "보호종료 예정" : "보호중"}
                breed={item.breed || item.species}
                region={item.happen_place || "-"}
                date={item.happen_dt || "-"}
            />
        )
    }

    return (
        <PostCard
            key={item.id}
            to={`/lost-posts/${item.id}`}
            thumbnail={item.first_image_url}
            badgeType="lost"
            badgeText="실종"
            breed={item.breed || item.species}
            region={item.region}
            date={item.event_date?.slice(0, 10)}
        />
    )
}

export default function HomePage() {
    const [sections, setSections] = useState(() => Object.fromEntries(
        SECTIONS.map(({ key }) => [key, { items: [], loading: true, error: "" }])
    ))
    const [pageLoading, setPageLoading] = useState(true)
    const [showPageLoading, setShowPageLoading] = useState(false)
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false
        let loadingVisibleAt = 0
        let finishTimer

        setPageLoading(true)
        setShowPageLoading(false)

        const loadingTimer = setTimeout(() => {
            if (cancelled) return

            loadingVisibleAt = Date.now()
            setShowPageLoading(true)
        }, LOADING_DELAY)

        async function loadSection(section) {
            const update = (state) => {
                if (!cancelled) {
                    setSections((current) => ({ ...current, [section.key]: state }))
                }
            }

            update({ items: [], loading: true, error: "" })

            try {
                const size = section.key === "found" ? 5 : 4
                const result = await section.request({ page: 1, size })
                update({ items: (result?.items ?? []).slice(0, size), loading: false, error: "" })
            } catch (error) {
                update({
                    items: [],
                    loading: false,
                    error: error.message || `${section.title} 소식을 불러오지 못했습니다.`
                })
            }
        }

        // 요청별로 오류를 처리하므로 한 API가 실패해도 나머지 섹션은 표시된다.
        Promise.allSettled(SECTIONS.map(loadSection)).then(() => {
            if (cancelled) return

            clearTimeout(loadingTimer)

            const visibleFor = loadingVisibleAt
                ? Date.now() - loadingVisibleAt
                : 0
            const remaining = loadingVisibleAt
                ? Math.max(0, MIN_LOADING_VISIBLE - visibleFor)
                : 0

            finishTimer = setTimeout(() => {
                if (cancelled) return

                setPageLoading(false)
                setShowPageLoading(false)
            }, remaining)
        })

        return () => {
            cancelled = true
            clearTimeout(loadingTimer)
            clearTimeout(finishTimer)
        }
    }, [retryCount])

    return (
        <div className="home-page">
            <section className="home-hero" aria-labelledby="home-title">
                <div className="container home-hero-content">
                    <h1 id="home-title">내 가족을 찾는 <span>For Mate</span></h1>
                    <p>실종된 반려동물을 AI와 공공데이터를 활용해 빠르게 찾아드립니다.</p>
                    <div className="home-hero-actions">
                        <Link to="/lost-posts/new" className="btn btn-primary">내 반려동물 찾기</Link>
                        <Link to="/found-posts/new" className="btn btn-outline">발견제보 작성</Link>
                    </div>
                </div>
            </section>

            {showPageLoading && (
                <Loading message="최신 소식을 불러오는 중입니다." />
            )}

            <div className="container home-sections">
                {SECTIONS.map((section) => {
                    const { items, loading, error } = sections[section.key]

                    return (
                        <section key={section.key} className="home-section" aria-labelledby={`home-${section.key}-title`}>
                            <div className="home-section-header">
                                <div>
                                    <h2 id={`home-${section.key}-title`}>{section.title}</h2>
                                    <p>{section.description}</p>
                                </div>
                                <Link to={section.to} className="home-view-all" aria-label={`${section.title} 전체보기`}>
                                    전체보기 <i className="ri-arrow-right-line" aria-hidden="true" />
                                </Link>
                            </div>
                            <div className="home-section-content" aria-busy={pageLoading}>
                                {!loading && error && (
                                    <ErrorState message={error} onRetry={() => setRetryCount((count) => count + 1)} />
                                )}
                                {!loading && !error && items.length === 0 && (
                                    <Empty message={`아직 등록된 ${section.title} 소식이 없습니다.`} />
                                )}
                                {!loading && !error && items.length > 0 && (
                                    section.key === "found"
                                        ? <div className="home-found-list">{items.map((item) => renderCard(section.key, item))}</div>
                                        : <PostGrid>{items.map((item) => renderCard(section.key, item))}</PostGrid>
                                )}
                            </div>
                        </section>
                    )
                })}
            </div>
        </div>
    )
}
