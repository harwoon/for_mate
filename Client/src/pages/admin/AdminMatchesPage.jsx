import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { getAdminMatches } from "../../api/admin.api.js"
import { imageUrl } from "../../api/client.js"
import { formatDate, formatDateTime } from "../../utils/date.js"

const PAGE_SIZE = 10
const FETCH_LIMIT = 1000

function similarityValue(value) {
    if (value === null || value === undefined || value === "") return null
    const score = Number(value)
    return Number.isFinite(score) ? score : null
}

function formatSimilarity(value) {
    const score = similarityValue(value)
    return score === null ? "-" : `${(score * 100).toFixed(1)}%`
}

function similarityClass(value) {
    const score = similarityValue(value)
    if (score >= 0.9) return "admin-match-score is-high"
    if (score >= 0.8) return "admin-match-score is-primary"
    return "admin-match-score"
}

function MatchImage({ value, name }) {
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        setFailed(false)
    }, [value])

    if (!value || failed) {
        return (
            <div className="admin-match-image is-empty">
                <i className="ri-image-line" aria-hidden="true" />
                <span>이미지 없음</span>
            </div>
        )
    }

    return (
        <img
            className="admin-match-image"
            src={imageUrl(value)}
            alt={name || "동물 사진"}
            loading="lazy"
            onError={() => setFailed(true)}
        />
    )
}

function animalPath(animal) {
    if (!["rescue", "pawinhand"].includes(animal?.source_type) || !animal.id) return null
    return `/rescue-animals/${animal.source_type}/${encodeURIComponent(animal.id)}`
}

export default function AdminMatchesPage() {
    const [minSimilarity, setMinSimilarity] = useState("")
    const [matchedDate, setMatchedDate] = useState("")
    const [keyword, setKeyword] = useState("")
    const [matches, setMatches] = useState([])
    const [page, setPage] = useState(1)
    const [expanded, setExpanded] = useState(new Set())
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function loadMatches() {
            setLoading(true)
            setError("")
            setMatches([])
            setExpanded(new Set())
            setPage(1)

            try {
                const result = await getAdminMatches({
                    min_similarity: minSimilarity,
                    matched_date: matchedDate,
                    limit: FETCH_LIMIT
                })

                if (cancelled) return
                if (!Array.isArray(result)) throw new Error("INVALID_RESPONSE")

                const normalizedMatches = result.flatMap((group) => {
                    if (!Array.isArray(group.matches)) {
                        return [group]
                    }

                    return group.matches.map((match) => ({
                        ...match,
                        lost_post: group.lost_post,
                        user: group.user
                    }))
                })

                setMatches(normalizedMatches)
                
            } catch {
                if (!cancelled) setError("AI 매칭 기록을 불러오지 못했습니다.")
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        loadMatches()
        return () => { cancelled = true }
    }, [minSimilarity, matchedDate, retryCount])

    const summary = useMemo(() => ({
        total: matches.length,
        posts: new Set(matches.map((match) => match.lost_post?.id).filter((id) => id != null)).size,
        high: matches.filter((match) => similarityValue(match.similarity_score) >= 0.9).length
    }), [matches])

    const groups = useMemo(() => {
        const byPostAndDate = new Map()

        for (const match of matches) {
            const lostPost = match.lost_post
            if (lostPost?.id == null) continue
            // 같은 공고의 날짜별 매칭 이력을 분리한다. 반환된 후보를 임의로 잘라내지 않는다.
            const key = `${lostPost.id}:${match.matched_date ?? ""}`
            if (!byPostAndDate.has(key)) {
                byPostAndDate.set(key, {
                    key,
                    lostPost,
                    matchedDate: match.matched_date,
                    latestCreatedAt: null,
                    latestTime: -Infinity,
                    maxSimilarity: null,
                    candidates: []
                })
            }
            const group = byPostAndDate.get(key)
            group.candidates.push(match)
            const score = similarityValue(match.similarity_score)
            if (score !== null && (group.maxSimilarity === null || score > group.maxSimilarity)) {
                group.maxSimilarity = score
            }
            const time = match.created_at ? Date.parse(match.created_at) : NaN
            if (Number.isFinite(time) && time > group.latestTime) {
                group.latestTime = time
                group.latestCreatedAt = match.created_at
            }
        }

        for (const group of byPostAndDate.values()) {
            group.candidates.sort((a, b) => (
                (similarityValue(b.similarity_score) ?? -Infinity) -
                (similarityValue(a.similarity_score) ?? -Infinity)
            ))
        }

        return [...byPostAndDate.values()].sort((a, b) => (
            b.latestTime - a.latestTime || b.key.localeCompare(a.key)
        ))
    }, [matches])

    const filteredGroups = useMemo(() => {
        const search = keyword.trim().toLowerCase()
        return groups.filter(({ lostPost }) => (
            !search || [lostPost.pet_name, lostPost.id].some((value) => (
                String(value ?? "").toLowerCase().includes(search)
            ))
        ))
    }, [groups, keyword])

    const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE))
    const currentPage = Math.min(page, totalPages)
    const visibleGroups = filteredGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    const hasFilters = Boolean(minSimilarity || matchedDate || keyword.trim())

    function resetFilters() {
        setMinSimilarity("")
        setMatchedDate("")
        setKeyword("")
        setPage(1)
        setExpanded(new Set())
    }

    function toggleGroup(key) {
        setExpanded((current) => {
            const next = new Set(current)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    return (
        <div className="admin-page admin-matches-page">
            <div className="admin-page-heading">
                <h2>AI 매칭 관리</h2>
                <p>AI가 생성한 실종동물과 보호동물의 매칭 후보를 확인합니다.</p>
            </div>

            <div className="admin-summary-grid admin-match-summary" aria-label="현재 조회 결과 통계">
                {[
                    ["ri-focus-3-line", "전체 매칭 후보", summary.total],
                    ["ri-search-eye-line", "매칭 대상 실종공고", summary.posts],
                    ["ri-sparkling-2-line", "90% 이상 후보", summary.high]
                ].map(([icon, label, count]) => (
                    <div className="admin-summary-item" key={label}>
                        <i className={icon} aria-hidden="true" />
                        <span>{label}</span>
                        <strong>{loading || error ? "-" : count.toLocaleString()}</strong>
                        <small>현재 조회 결과 기준</small>
                    </div>
                ))}
            </div>

            <section className="admin-list-panel" aria-label="AI 매칭 기록">
                <div className="admin-list-toolbar admin-match-filters">
                    <label className="admin-match-field">
                        <span>최소 유사도</span>
                        <select value={minSimilarity} onChange={(event) => setMinSimilarity(event.target.value)}>
                            <option value="">전체</option>
                            <option value="0.7">70% 이상</option>
                            <option value="0.8">80% 이상</option>
                            <option value="0.9">90% 이상</option>
                        </select>
                    </label>
                    <label className="admin-match-field">
                        <span>매칭 날짜</span>
                        <input type="date" value={matchedDate} onChange={(event) => setMatchedDate(event.target.value)} />
                    </label>
                    <label className="admin-match-field admin-match-search">
                        <span>실종 공고 검색</span>
                        <div className="admin-search-box">
                            <i className="ri-search-line" aria-hidden="true" />
                            <input
                                type="search"
                                value={keyword}
                                placeholder="실종동물 이름 또는 공고 ID 검색"
                                onChange={(event) => { setKeyword(event.target.value); setPage(1) }}
                            />
                        </div>
                    </label>
                    <button type="button" className="admin-back-button" onClick={resetFilters}>
                        <i className="ri-restart-line" aria-hidden="true" />필터 초기화
                    </button>
                </div>

                <div className="admin-list-summary admin-match-list-summary">
                    <span>실종 공고·매칭일별 <strong>{loading || error ? "-" : filteredGroups.length}</strong>개 그룹</span>
                    <span>조회된 후보 기준 · 유사도 높은 순으로 확인</span>
                </div>
                {!loading && !error && matches.length >= FETCH_LIMIT && (
                    <p className="admin-match-notice" role="status">
                        최신 {FETCH_LIMIT.toLocaleString()}건을 표시하고 있습니다. 일부 그룹의 후보가 포함되지 않을 수 있으니 매칭 날짜로 범위를 좁혀주세요.
                    </p>
                )}

                {loading && (
                    <div className="admin-list-state" role="status">
                        <i className="ri-loader-4-line admin-spin" aria-hidden="true" />
                        <span>AI 매칭 기록을 불러오는 중입니다.</span>
                    </div>
                )}
                {!loading && error && (
                    <div className="admin-list-state is-error" role="alert">
                        <i className="ri-error-warning-line" aria-hidden="true" />
                        <p>{error}</p>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setRetryCount((count) => count + 1)}>다시 시도</button>
                    </div>
                )}
                {!loading && !error && !filteredGroups.length && (
                    <div className="admin-list-state" role="status">
                        <i className="ri-file-search-line" aria-hidden="true" />
                        <span>{hasFilters ? "조건에 맞는 AI 매칭 기록이 없습니다." : "아직 생성된 AI 매칭 기록이 없습니다."}</span>
                    </div>
                )}
                {!loading && !error && visibleGroups.map((group) => {
                    const isOpen = expanded.has(group.key)
                    const panelId = `match-candidates-${group.key}`
                    return (
                        <article className={`admin-match-group${isOpen ? " is-open" : ""}`} key={group.key}>
                            <div className="admin-match-row">
                                <div className="admin-match-identity">
                                    <MatchImage value={group.lostPost.image_url} name={group.lostPost.pet_name} />
                                    <div>
                                        <span className="admin-detail-id">실종 공고 #{group.lostPost.id}</span>
                                        <h3>{group.lostPost.pet_name || "이름 없음"}</h3>
                                        <span>{group.lostPost.species || "종류 정보 없음"}</span>
                                    </div>
                                </div>
                                <dl className="admin-match-metrics">
                                    <div><dt>최고 유사도</dt><dd className={similarityClass(group.maxSimilarity)}>{formatSimilarity(group.maxSimilarity)}</dd></div>
                                    <div><dt>후보</dt><dd>{group.candidates.length}건</dd></div>
                                    <div><dt>매칭일</dt><dd>{formatDate(group.matchedDate)}</dd></div>
                                    <div><dt>최근 생성일</dt><dd>{formatDateTime(group.latestCreatedAt)}</dd></div>
                                </dl>
                                <button
                                    type="button"
                                    className="admin-back-button admin-match-toggle"
                                    aria-expanded={isOpen}
                                    aria-controls={panelId}
                                    onClick={() => toggleGroup(group.key)}
                                >
                                    {isOpen ? "후보 닫기" : "후보 보기"}
                                    <i className={isOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} aria-hidden="true" />
                                </button>
                            </div>
                            {isOpen && (
                                <div className="admin-match-candidates" id={panelId}>
                                    <div className="admin-match-candidate-heading">
                                        <h4>AI 매칭 후보 <strong>{group.candidates.length}건</strong></h4>
                                        <Link className="admin-table-link" to={`/lost-posts/${group.lostPost.id}`}>실종 공고 보기 <i className="ri-arrow-right-line" aria-hidden="true" /></Link>
                                    </div>
                                    <ol className="admin-match-candidate-list">
                                        {group.candidates.map((match, index) => {
                                            const animal = match.animal
                                            const path = animalPath(animal)
                                            return (
                                                <li className="admin-match-candidate" key={match.id}>
                                                    <MatchImage value={animal?.image_url} name={animal?.kind_nm} />
                                                    <div className="admin-match-animal">
                                                        <span className="admin-match-rank">{index + 1}위</span>
                                                        <strong>{animal?.kind_nm || "품종 정보 없음"}</strong>
                                                        <span>{animal?.up_kind_nm || "종류 정보 없음"}</span>
                                                        <small>{animal?.source_type === "pawinhand" ? "포인핸드 공고" : "구조동물 번호"}: {animal?.id ?? "-"}</small>
                                                    </div>
                                                    <div className="admin-match-candidate-score">
                                                        <span>유사도</span>
                                                        <strong className={similarityClass(match.similarity_score)}>{formatSimilarity(match.similarity_score)}</strong>
                                                    </div>
                                                    {path && <Link className="admin-table-link" to={path}>보호 공고 보기 <i className="ri-arrow-right-line" aria-hidden="true" /></Link>}
                                                </li>
                                            )
                                        })}
                                    </ol>
                                </div>
                            )}
                        </article>
                    )
                })}

                {!loading && !error && filteredGroups.length > 0 && (
                    <nav className="admin-table-pagination" aria-label="매칭 그룹 페이지">
                        <button type="button" aria-label="이전 페이지" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><i className="ri-arrow-left-s-line" aria-hidden="true" /></button>
                        <span><strong>{currentPage}</strong> / {totalPages}</span>
                        <button type="button" aria-label="다음 페이지" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}><i className="ri-arrow-right-s-line" aria-hidden="true" /></button>
                    </nav>
                )}
            </section>
        </div>
    )
}
