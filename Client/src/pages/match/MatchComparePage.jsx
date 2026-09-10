import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getLostPost } from "../../api/lostPosts.api.js"
import { getMatchDetail } from "../../api/matches.api.js"
import { getAnimalBySource } from "../../api/rescueAnimals.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import { formatDate } from "../../utils/date.js"

const SOURCE_LABELS = {
    rescue: "공공데이터",
    pawinhand: "포인핸드"
}

const SEX_LABELS = {
    M: "수컷",
    F: "암컷",
    Q: "미상",
    U: "미상"
}

const STATUS_LABELS = {
    match: "조건 유사",
    mismatch: "차이 있음",
    unknown: "확인 필요"
}

function displayValue(value) {
    if (value === undefined || value === null || value === "") {
        return "정보 없음"
    }

    return value
}

function displayColors(color, colorTags) {
    if (color) return color

    if (Array.isArray(colorTags) && colorTags.length > 0) {
        return colorTags.join(", ")
    }

    return "정보 없음"
}

function displaySex(value) {
    if (!value) return "정보 없음"
    return SEX_LABELS[value] ?? value
}

function displayRegion(animal) {
    if (!animal) return "정보 없음"

    if (animal.happen_place) {
        return animal.happen_place
    }

    const region = [
        animal.region_sido,
        animal.region_sigungu
    ].filter(Boolean).join(" ")

    return region || "정보 없음"
}

function formatSimilarity(value) {
    const similarity = Number(value)

    if (!Number.isFinite(similarity)) {
        return "-"
    }

    return `${(similarity * 100).toFixed(1)}%`
}

function findComparison(comparison, label) {
    return comparison.find((item) => item.label === label)
}

function ComparisonStatus({ item }) {
    if (!item) {
        return (
            <span className="match-comparison-status is-unknown">
                확인 필요
            </span>
        )
    }

    if (
        item.label === "날짜" &&
        item.status === "match" &&
        Number.isFinite(Number(item.diffDays))
    ) {
        return (
            <span className="match-comparison-status is-match">
                {Math.abs(Number(item.diffDays))}일 차이
            </span>
        )
    }

    return (
        <span
            className={`match-comparison-status is-${item.status || "unknown"}`}
        >
            {STATUS_LABELS[item.status] ?? "확인 필요"}
        </span>
    )
}

export default function MatchComparePage() {
    const { matchId } = useParams()
    const navigate = useNavigate()

    const [match, setMatch] = useState(null)
    const [lostPost, setLostPost] = useState(null)
    const [animal, setAnimal] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [retryCount, setRetryCount] = useState(0)
    const [lostImageFailed, setLostImageFailed] = useState(false)
    const [animalImageFailed, setAnimalImageFailed] = useState(false)

    useEffect(() => {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        })
    }, [matchId])

    useEffect(() => {
        let cancelled = false

        async function loadMatch() {
            setLoading(true)
            setError(null)
            setMatch(null)
            setLostPost(null)
            setAnimal(null)
            setLostImageFailed(false)
            setAnimalImageFailed(false)

            try {
                const result = await getMatchDetail(matchId)

                if (cancelled) return

                if (!result?.lost_post || !result?.animal) {
                    throw new Error(
                        "매칭 상세 정보를 불러오지 못했습니다."
                    )
                }

                setMatch(result)

                const lostPostId = result.lost_post.id
                const sourceType = result.animal.source_type
                const animalId = result.animal.id

                const [lostResult, animalResult] =
                    await Promise.allSettled([
                        getLostPost(lostPostId),
                        getAnimalBySource(sourceType, animalId)
                    ])

                if (cancelled) return

                if (lostResult.status === "fulfilled") {
                    setLostPost(lostResult.value)
                }

                if (animalResult.status === "fulfilled") {
                    setAnimal(animalResult.value)
                }
            } catch (error) {
                if (!cancelled) {
                    setError(error)
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadMatch()

        return () => {
            cancelled = true
        }
    }, [matchId, retryCount])

    if (loading) {
        return (
            <Loading message="매칭 상세 정보를 불러오는 중입니다." />
        )
    }

    if (error) {
        const canRetry = ![400, 401, 403, 404].includes(error.status)

        return (
            <ErrorState
                message={
                    error.message ||
                    "매칭 상세 정보를 불러오지 못했습니다."
                }
                onRetry={
                    canRetry
                        ? () => setRetryCount((count) => count + 1)
                        : undefined
                }
                onHome={() => navigate("/")}
            />
        )
    }

    if (!match) {
        return (
            <Empty message="매칭 결과를 찾을 수 없습니다." />
        )
    }

    const comparison = match.comparison ?? []

    const breedComparison = findComparison(
        comparison,
        "품종"
    )
    const sexComparison = findComparison(
        comparison,
        "성별"
    )
    const colorComparison = findComparison(
        comparison,
        "색상"
    )
    const regionComparison = findComparison(
        comparison,
        "지역"
    )
    const dateComparison = findComparison(
        comparison,
        "날짜"
    )

    const lostImage =
        lostPost?.images?.[0]?.image_url ?? null

    const animalImage =
        animal?.images?.[0] ?? null

    const lostName =
        lostPost?.pet_name ||
        match.lost_post.pet_name ||
        "내 실종동물"

    const lostBreed =
        lostPost?.breed ||
        breedComparison?.lost

    const animalBreed =
        animal?.breed ||
        breedComparison?.rescue

    const lostColor =
        lostPost?.color ||
        colorComparison?.lost

    const animalColor =
        animal
            ? displayColors(
                animal.color,
                animal.color_tags
            )
            : colorComparison?.rescue

    const lostSex =
        lostPost?.sex
            ? displaySex(lostPost.sex)
            : sexComparison?.lost

    const animalSex =
        animal?.sex
            ? displaySex(animal.sex)
            : sexComparison?.rescue

    const lostRegion =
        lostPost?.region ||
        regionComparison?.lost

    const animalRegion =
        animal
            ? displayRegion(animal)
            : regionComparison?.rescue

    const lostDate =
        lostPost?.event_date ||
        dateComparison?.lost

    const animalDate =
        animal?.happen_dt ||
        dateComparison?.rescue

    const sourceType = match.animal.source_type
    const sourceLabel =
        SOURCE_LABELS[sourceType] || "보호동물 데이터"

    return (
        <div className="container match-compare-page">
            <Breadcrumb
                items={[
                    {
                        label: "홈",
                        to: "/"
                    },
                    {
                        label: "AI로 찾기",
                        to: "/ai-search"
                    },
                    {
                        label: "AI 매칭 결과",
                        to: `/lost-posts/${match.lost_post.id}/matches`
                    },
                    {
                        label: "상세 비교"
                    }
                ]}
            />

            <div className="page-header match-compare-header">
                <div>
                    <h1 className="page-title">
                        AI 매칭 상세 비교
                    </h1>

                    <p className="page-desc">
                        내 실종동물과 매칭 후보의 사진과
                        정보를 한 화면에서 비교해보세요.
                    </p>
                </div>

                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() =>
                        navigate(
                            `/lost-posts/${match.lost_post.id}/matches`
                        )
                    }
                >
                    <i
                        className="ri-arrow-left-line"
                        aria-hidden="true"
                    />
                    매칭 결과로
                </button>
            </div>

            <section className="card card-padded match-compare-summary">
                <div className="match-summary-copy">
                    <span className="match-summary-label">
                        AI 분석 결과
                    </span>

                    <h2>
                        {lostName}와 유사한 보호동물
                        후보입니다.
                    </h2>

                    <p className="text-sub">
                        이미지 특징을 기반으로 계산된
                        유사도이며, 아래 세부 정보도 함께
                        확인해주세요.
                    </p>
                </div>

                <div className="match-similarity-box">
                    <span>AI 이미지 유사도</span>

                    <strong>
                        {formatSimilarity(
                            match.similarity_score
                        )}
                    </strong>
                </div>
            </section>

            <section className="match-animal-pair">
                <article className="card card-padded match-animal-card">
                    <div className="match-animal-card-header">
                        <div>
                            <span className="match-card-kicker">
                                내 실종동물
                            </span>

                            <h2>{lostName}</h2>
                        </div>

                        <span className="match-type-badge is-lost">
                            실종
                        </span>
                    </div>

                    <div className="match-animal-image">
                        {lostImage && !lostImageFailed ? (
                            <img
                                src={imageUrl(lostImage)}
                                alt={`${lostName} 사진`}
                                onError={() =>
                                    setLostImageFailed(true)
                                }
                            />
                        ) : (
                            <div className="match-image-placeholder">
                                <i
                                    className="ri-image-line"
                                    aria-hidden="true"
                                />
                                <span>사진 없음</span>
                            </div>
                        )}
                    </div>

                    <dl className="match-animal-meta">
                        <div>
                            <dt>종류</dt>
                            <dd>
                                {displayValue(
                                    lostPost?.species ||
                                    match.lost_post.species
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>품종</dt>
                            <dd>
                                {displayValue(lostBreed)}
                            </dd>
                        </div>

                        <div>
                            <dt>색상</dt>
                            <dd>
                                {displayValue(lostColor)}
                            </dd>
                        </div>

                        <div>
                            <dt>위치</dt>
                            <dd>
                                {displayValue(lostRegion)}
                            </dd>
                        </div>

                        <div>
                            <dt>실종일</dt>
                            <dd>
                                {formatDate(
                                    lostDate,
                                    "정보 없음"
                                )}
                            </dd>
                        </div>
                    </dl>
                </article>

                <article className="card card-padded match-animal-card is-candidate">
                    <div className="match-animal-card-header">
                        <div>
                            <span className="match-card-kicker">
                                매칭 후보
                            </span>

                            <h2>
                                {displayValue(animalBreed)}
                            </h2>
                        </div>

                        <span className="match-type-badge is-candidate">
                            {sourceLabel}
                        </span>
                    </div>

                    <div className="match-animal-image">
                        {animalImage && !animalImageFailed ? (
                            <img
                                src={imageUrl(animalImage)}
                                alt={`${animalBreed || "매칭 후보"} 사진`}
                                onError={() =>
                                    setAnimalImageFailed(true)
                                }
                            />
                        ) : (
                            <div className="match-image-placeholder">
                                <i
                                    className="ri-image-line"
                                    aria-hidden="true"
                                />
                                <span>사진 없음</span>
                            </div>
                        )}

                        <span className="match-image-score">
                            {formatSimilarity(
                                match.similarity_score
                            )}
                        </span>
                    </div>

                    <dl className="match-animal-meta">
                        <div>
                            <dt>종류</dt>
                            <dd>
                                {displayValue(
                                    animal?.species ||
                                    match.animal.up_kind_nm
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>품종</dt>
                            <dd>
                                {displayValue(animalBreed)}
                            </dd>
                        </div>

                        <div>
                            <dt>색상</dt>
                            <dd>
                                {displayValue(animalColor)}
                            </dd>
                        </div>

                        <div>
                            <dt>위치</dt>
                            <dd>
                                {displayValue(animalRegion)}
                            </dd>
                        </div>

                        <div>
                            <dt>발견일</dt>
                            <dd>
                                {formatDate(
                                    animalDate,
                                    "정보 없음"
                                )}
                            </dd>
                        </div>
                    </dl>
                </article>
            </section>

            <section className="card card-padded match-comparison-section">
                <div className="match-section-heading">
                    <div>
                        <h2>항목별 비교</h2>

                        <p className="text-sub">
                            사진 유사도와 함께 등록 정보를
                            비교해서 확인해주세요.
                        </p>
                    </div>
                </div>

                <div className="match-comparison-table">
                    <div
                        className="match-comparison-head"
                        aria-hidden="true"
                    >
                        <span>비교 항목</span>
                        <span>내 실종동물</span>
                        <span>매칭 후보</span>
                        <span>비교 결과</span>
                    </div>

                    {comparison.map((item) => (
                        <div
                            key={item.label}
                            className="match-comparison-row"
                        >
                            <strong className="match-comparison-label">
                                {item.label}
                            </strong>

                            <span
                                className="match-comparison-value"
                                data-label="내 실종동물"
                            >
                                {item.label === "날짜"
                                    ? formatDate(
                                        item.lost,
                                        "정보 없음"
                                    )
                                    : displayValue(item.lost)}
                            </span>

                            <span
                                className="match-comparison-value"
                                data-label="매칭 후보"
                            >
                                {item.label === "날짜"
                                    ? formatDate(
                                        item.rescue,
                                        "정보 없음"
                                    )
                                    : displayValue(item.rescue)}
                            </span>

                            <span className="match-comparison-result">
                                <ComparisonStatus item={item} />
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <div className="match-compare-actions">
                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() =>
                        navigate(
                            `/lost-posts/${match.lost_post.id}`
                        )
                    }
                >
                    내 실종 공고 보기
                </button>

                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                        navigate(
                            `/rescue-animals/${sourceType}/${match.animal.id}`
                        )
                    }
                >
                    보호동물 공고 보기
                    <i
                        className="ri-arrow-right-line"
                        aria-hidden="true"
                    />
                </button>
            </div>

            <aside className="match-disclaimer">
                <i
                    className="ri-information-line"
                    aria-hidden="true"
                />

                <p>
                    AI 이미지 유사도는 사진의 특징을 기반으로
                    계산한 참고 정보이며 동일 개체임을
                    확정하지 않습니다. 사진, 품종, 색상,
                    성별, 위치, 날짜 등의 정보를 함께
                    확인해주세요.
                </p>
            </aside>
        </div>
    )
}