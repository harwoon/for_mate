import { useEffect, useRef, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getMatches } from "../../api/matches.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import PostGrid from "../../components/post/PostGrid.jsx"
import { formatDate } from "../../utils/date.js"

const SOURCE_LABELS = { rescue: "공공데이터", pawinhand: "포인핸드" }
const SEX_LABELS = { M: "수컷", F: "암컷", Q: "미상", U: "미상" }

function similarityValue(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : -1
}

function MatchCard({ match }) {
    const [imageFailed, setImageFailed] = useState(false)
    const similarity = similarityValue(match.similarity)
    const matchId = String(match.match_id ?? "")
    const hasMatchId = /^[1-9]\d*$/.test(matchId)
    const colors = Array.isArray(match.color_tags) ? match.color_tags.filter(Boolean).join(", ") : ""
    const region = match.happen_place || [match.region_sido, match.region_sigungu].filter(Boolean).join(" ")

    useEffect(() => setImageFailed(false), [match.image_url])

    return (
        <article className="card match-result-card">
            <div className="post-card-image-wrap">
                {match.image_url && !imageFailed ? (
                    <img className="post-card-thumb" src={imageUrl(match.image_url)} alt={`${match.breed || match.species || "보호동물"} 사진`} onError={() => setImageFailed(true)} />
                ) : (
                    <div className="post-card-image-empty"><i className="ri-image-line" aria-hidden="true" />사진 없음</div>
                )}
            </div>
            <div className="match-result-body">
                <div className="match-result-score">
                    <span>이미지 유사도</span>
                    <strong>{similarity >= 0 ? `${(similarity * 100).toFixed(1)}%` : "정보 없음"}</strong>
                </div>
                <h2>{match.breed || match.species || "품종 정보 없음"}</h2>
                <dl className="match-result-details">
                    <div><dt>색상</dt><dd>{colors || match.color || "정보 없음"}</dd></div>
                    <div><dt>성별</dt><dd>{SEX_LABELS[match.sex] || "미상"}</dd></div>
                    <div><dt>발견 위치</dt><dd>{region || "정보 없음"}</dd></div>
                    <div><dt>발견일</dt><dd>{formatDate(match.happen_dt, "정보 없음")}</dd></div>
                    <div><dt>출처</dt><dd>{SOURCE_LABELS[match.source_type] || "정보 없음"}</dd></div>
                </dl>
                {hasMatchId ? (
                    <Link className="btn btn-outline" to={`/matches/${matchId}`} aria-label={`${match.breed || match.species || "보호동물"} 상세 비교`}>상세 비교</Link>
                ) : (
                    <button className="btn btn-outline" disabled>상세 비교 불가</button>
                )}
            </div>
        </article>
    )
}

export default function MatchResultPage() {
    const { id: lostPostId } = useParams()
    const location = useLocation()
    const navigate = useNavigate()
    const initialMatches = location.state?.initialMatches
    const [matches, setMatches] = useState(() => Array.isArray(initialMatches) ? initialMatches : [])
    const [loading, setLoading] = useState(() => !Array.isArray(initialMatches))
    const [error, setError] = useState(null)
    const [retryCount, setRetryCount] = useState(0)
    const requestRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        setError(null)
        if (Array.isArray(initialMatches)) {
            setMatches(initialMatches)
            setLoading(false)
            return
        }

        async function loadMatches() {
            setLoading(true)
            setMatches([])
            try {
                // StrictMode의 effect 재실행에서도 진행 중인 동일 요청을 재사용한다.
                const previous = requestRef.current
                if (!previous || previous.id !== lostPostId || previous.retry !== retryCount) {
                    requestRef.current = { id: lostPostId, retry: retryCount, promise: getMatches(lostPostId) }
                }
                const results = await requestRef.current.promise
                if (cancelled) return
                if (!Array.isArray(results)) throw new Error("매칭 결과를 불러오지 못했습니다. 다시 시도해주세요.")
                setMatches(results)
            } catch (error) {
                if (!cancelled) setError(error)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        loadMatches()
        return () => { cancelled = true }
    }, [lostPostId, initialMatches, retryCount])

    const sortedMatches = [...matches].sort((a, b) => similarityValue(b.similarity) - similarityValue(a.similarity))
    const canRetry = error && ![400, 401, 403, 404].includes(error.status)

    return (
        <div className="container match-result-page">
            <Breadcrumb items={[{ label: "홈", to: "/" }, { label: "AI로 찾기", to: "/ai-search" }, { label: "AI 매칭 결과" }]} />
            <div className="page-header">
                <div>
                    <h1 className="page-title">AI 매칭 결과</h1>
                    <p className="page-desc">사진이 유사한 보호동물을 확인하고 상세 정보를 비교해보세요.</p>
                </div>
            </div>
            {loading && <Loading message="AI 매칭 결과를 불러오는 중입니다." />}
            {!loading && error && (
                <ErrorState message={error.message || "매칭 결과를 불러오지 못했습니다."} onRetry={canRetry ? () => setRetryCount((count) => count + 1) : undefined} onHome={() => navigate("/")} />
            )}
            {!loading && !error && sortedMatches.length === 0 && (
                <Empty
                    message="현재 유사한 보호동물을 찾지 못했습니다."
                    action={<div className="stack"><p className="text-sub">새로운 보호동물이 등록되면 다시 확인해보세요.</p><Link className="btn btn-outline" to="/ai-search" state={{ lostPostId }}>AI로 다시 찾기</Link></div>}
                />
            )}
            {!loading && !error && sortedMatches.length > 0 && (
                <section aria-label="AI 매칭 후보">
                    <p className="match-result-count">유사한 후보 <strong>{sortedMatches.length}건</strong></p>
                    <PostGrid>
                        {sortedMatches.map((match, index) => <MatchCard key={`${match.source_type}:${match.match_id ?? index}`} match={match} />)}
                    </PostGrid>
                </section>
            )}
        </div>
    )
}
