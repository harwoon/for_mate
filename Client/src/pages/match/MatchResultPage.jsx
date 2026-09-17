import {
    useEffect,
    useRef,
    useState
} from "react"
import {
    Link,
    useLocation,
    useNavigate,
    useParams
} from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getMatches } from "../../api/matches.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import MatchFilterModal, { EMPTY_MATCH_FILTERS } from "../../components/match/MatchFilterModal.jsx"
import FilterBar from "../../components/post/FilterBar.jsx"
import PostGrid from "../../components/post/PostGrid.jsx"
import { formatDate } from "../../utils/date.js"

const INITIAL_LIMIT = 8
const LOAD_MORE_SIZE = 8
const DEFAULT_MAX_LIMIT = 50

const SORT_OPTIONS = [
    { value: "similarity_desc", label: "유사도 높은 순" },
    { value: "happen_date_desc", label: "최근 발견순" },
    { value: "happen_date_asc", label: "오래된 발견순" },
    { value: "notice_end_asc", label: "공고 마감 임박순" }
]

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

const NEUTER_LABELS = {
    Y: "중성화 완료",
    N: "중성화 안 됨",
    U: "미상"
}

function matchParams(filters, sort, limit) {
    return Object.fromEntries(
        Object.entries({ ...filters, sort, limit })
            .filter(([, value]) => value !== "" && value != null)
    )
}

function similarityValue(value) {
    return (
        typeof value === "number" &&
        Number.isFinite(value)
    )
        ? value
        : -1
}

function normalizeResult(result) {
    if (
        !result ||
        !Array.isArray(result.items)
    ) {
        return null
    }

    return {
        items: result.items,
        limit:
            Number(result.limit) ||
            INITIAL_LIMIT,
        maxLimit:
            Number(
                result.max_limit
            ) ||
            DEFAULT_MAX_LIMIT,
        total:
            Number(result.total) || 0,
        hasMore:
            Boolean(
                result.has_more
            )
    }
}

function MatchCard({
    match
}) {
    const [
        imageFailed,
        setImageFailed
    ] = useState(false)

    const similarity =
        similarityValue(
            match.similarity
        )

    const matchId =
        String(
            match.match_id ?? ""
        )

    const hasMatchId =
        /^[1-9]\d*$/.test(
            matchId
        )

    const colors =
        Array.isArray(
            match.color_tags
        )
            ? match.color_tags
                .filter(Boolean)
                .join(", ")
            : ""

    const region =
        match.happen_place ||
        [
            match.region_sido,
            match.region_sigungu
        ]
            .filter(Boolean)
            .join(" ")

    useEffect(() => {
        setImageFailed(false)
    }, [match.image_url])

    return (
        <article className="card match-result-card">
            <div className="post-card-image-wrap">
                {match.image_url &&
                !imageFailed ? (
                    <img
                        className="post-card-thumb"
                        src={imageUrl(
                            match.image_url
                        )}
                        alt={`${match.breed || match.species || "보호동물"} 사진`}
                        onError={() =>
                            setImageFailed(
                                true
                            )
                        }
                    />
                ) : (
                    <div className="post-card-image-empty">
                        <i
                            className="ri-image-line"
                            aria-hidden="true"
                        />
                        사진 없음
                    </div>
                )}
            </div>

            <div className="match-result-body">
                <div className="match-result-score">
                    <span>
                        {match.rank
                            ? `${match.rank}위 · `
                            : ""}
                        이미지 유사도
                    </span>

                    <strong>
                        {similarity >= 0
                            ? `${(
                                similarity *
                                100
                            ).toFixed(
                                1
                            )}%`
                            : "정보 없음"}
                    </strong>
                </div>

                <h2>
                    {match.breed ||
                        match.species ||
                        "품종 정보 없음"}
                </h2>

                <dl className="match-result-details">
                    <div>
                        <dt>
                            색상
                        </dt>

                        <dd>
                            {colors ||
                                match.color ||
                                "정보 없음"}
                        </dd>
                    </div>

                    <div>
                        <dt>
                            성별
                        </dt>

                        <dd>
                            {SEX_LABELS[
                                match.sex
                            ] || "미상"}
                        </dd>
                    </div>

                    <div>
                        <dt>
                            발견 위치
                        </dt>

                        <dd>
                            {region ||
                                "정보 없음"}
                        </dd>
                    </div>

                    <div>
                        <dt>중성화</dt>
                        <dd>
                            {NEUTER_LABELS[match.neuter] || "미상"}
                        </dd>
                    </div>

                    <div>
                        <dt>
                            발견일
                        </dt>

                        <dd>
                            {formatDate(
                                match.happen_dt,
                                "정보 없음"
                            )}
                        </dd>
                    </div>

                    <div>
                        <dt>
                            출처
                        </dt>

                        <dd>
                            {SOURCE_LABELS[
                                match
                                    .source_type
                            ] ||
                                "정보 없음"}
                        </dd>
                    </div>
                </dl>

                {hasMatchId ? (
                    <Link
                        className="btn btn-outline"
                        to={`/matches/${matchId}`}
                        aria-label={`${match.breed || match.species || "보호동물"} 상세 비교`}
                    >
                        상세 비교
                    </Link>
                ) : (
                    <button
                        className="btn btn-outline"
                        disabled
                    >
                        상세 비교 불가
                    </button>
                )}
            </div>
        </article>
    )
}

export default function MatchResultPage() {
    const {
        id: lostPostId
    } = useParams()

    const location =
        useLocation()

    const navigate =
        useNavigate()

    const initialMatchResult =
        location.state
            ?.initialMatchResult

    const initialResult =
        normalizeResult(
            initialMatchResult
        )

    const [
        matches,
        setMatches
    ] = useState(
        () =>
            initialResult?.items ??
            []
    )

    const [
        resultLimit,
        setResultLimit
    ] = useState(
        () =>
            initialResult?.limit ??
            INITIAL_LIMIT
    )

    const [
        maxLimit,
        setMaxLimit
    ] = useState(
        () =>
            initialResult
                ?.maxLimit ??
            DEFAULT_MAX_LIMIT
    )

    const [
        hasMore,
        setHasMore
    ] = useState(
        () =>
            initialResult
                ?.hasMore ??
            false
    )

    const [resultTotal, setResultTotal] = useState(
        () => initialResult?.total ?? 0
    )

    const [
        loading,
        setLoading
    ] = useState(
        () =>
            !initialResult
    )

    const [
        loadingMore,
        setLoadingMore
    ] = useState(false)

    const [
        error,
        setError
    ] = useState(null)

    const [
        loadMoreError,
        setLoadMoreError
    ] = useState("")

    const [
        retryCount,
        setRetryCount
    ] = useState(0)

    const [filters, setFilters] = useState(() => ({ ...EMPTY_MATCH_FILTERS }))
    const [sort, setSort] = useState("similarity_desc")
    const [filterOpen, setFilterOpen] = useState(false)

    const requestRef =
        useRef(null)

    const requestKey = JSON.stringify({ lostPostId, filters, sort, retryCount })
    const initialRequestKeyRef = useRef(
        initialResult
            ? requestKey
            : null
    )

    useEffect(() => {
        let cancelled = false

        setError(null)

        // AI 검색 화면에서 전달된 결과는 StrictMode의 effect 재실행 때도 재사용한다.
        if (initialRequestKeyRef.current === requestKey) {
            return
        }

        // 필터·정렬·재시도 조건이 바뀐 뒤에는 같은 조건으로 돌아와도 다시 조회한다.
        initialRequestKeyRef.current = null

        async function loadMatches() {
            setLoading(true)
            setMatches([])

            try {
                const previous =
                    requestRef.current

                if (
                    !previous ||
                    previous.id !==
                        lostPostId ||
                    previous.key !==
                        requestKey
                ) {
                    requestRef.current =
                        {
                            id:
                                lostPostId,
                            key:
                                requestKey,
                            promise:
                                getMatches(
                                    lostPostId,
                                    matchParams(
                                        filters,
                                        sort,
                                        INITIAL_LIMIT
                                    )
                                )
                        }
                }

                const rawResult =
                    await requestRef
                        .current
                        .promise

                if (cancelled) {
                    return
                }

                const result =
                    normalizeResult(
                        rawResult
                    )

                if (!result) {
                    throw new Error(
                        "매칭 결과를 불러오지 못했습니다. 다시 시도해주세요."
                    )
                }

                setMatches(
                    result.items
                )

                setResultLimit(
                    result.limit
                )

                setMaxLimit(
                    result.maxLimit
                )

                setHasMore(
                    result.hasMore
                )

                setResultTotal(
                    result.total
                )
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

        loadMatches()

        return () => {
            cancelled = true
        }
    }, [
        lostPostId,
        requestKey
    ])

    async function handleLoadMore() {
        if (
            loadingMore ||
            !hasMore
        ) {
            return
        }

        const nextLimit =
            Math.min(
                resultLimit +
                    LOAD_MORE_SIZE,
                maxLimit
            )

        if (
            nextLimit <=
            resultLimit
        ) {
            setHasMore(false)
            return
        }

        setLoadingMore(true)
        setLoadMoreError("")

        try {
            const rawResult =
                await getMatches(
                    lostPostId,
                    matchParams(
                        filters,
                        sort,
                        nextLimit
                    )
                )

            const result =
                normalizeResult(
                    rawResult
                )

            if (!result) {
                throw new Error(
                    "다음 순위 후보를 불러오지 못했습니다."
                )
            }

            // 서버가 1위부터 현재 요청 순위까지 다시 보내므로
            // 기존 배열에 append하지 않고 전체 결과를 교체한다.
            // 이렇게 해야 순위가 변경되는 경우에도 중복이 생기지 않는다.
            setMatches(
                result.items
            )

            setResultLimit(
                result.limit
            )

            setMaxLimit(
                result.maxLimit
            )

            setHasMore(
                result.hasMore
            )

            setResultTotal(
                result.total
            )
        } catch (error) {
            setLoadMoreError(
                error.message ||
                "다음 순위 후보를 불러오지 못했습니다."
            )
        } finally {
            setLoadingMore(false)
        }
    }

    const filterChips = [
        filters.sex && {
            key: "sex",
            label: `성별: ${SEX_LABELS[filters.sex]}`,
            onRemove: () => setFilters((current) => ({ ...current, sex: "" }))
        },
        filters.neuter && {
            key: "neuter",
            label: `중성화: ${NEUTER_LABELS[filters.neuter]}`,
            onRemove: () => setFilters((current) => ({ ...current, neuter: "" }))
        },
        filters.sido && {
            key: "region",
            label: `지역: ${[filters.sido, filters.sigungu].filter(Boolean).join(" ")}`,
            onRemove: () => setFilters((current) => ({ ...current, sido: "", sigungu: "" }))
        },
        (filters.start_date || filters.end_date) && {
            key: "date",
            label: `발견일: ${filters.start_date || "처음"} ~ ${filters.end_date || "현재"}`,
            onRemove: () => setFilters((current) => ({ ...current, start_date: "", end_date: "" }))
        }
    ].filter(Boolean)

    const canRetry =
        error &&
        ![
            400,
            401,
            403,
            404
        ].includes(
            error.status
        )

    const nextStart =
        Math.min(
            resultLimit,
            maxLimit
        ) + 1

    const nextEnd =
        Math.min(
            resultLimit +
                LOAD_MORE_SIZE,
            maxLimit
        )

    return (
        <div className="container match-result-page">
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
                        label: "AI 매칭 결과"
                    }
                ]}
            />

            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        AI 매칭 결과
                    </h1>

                    <p className="page-desc">
                        사진이 유사한 보호동물을 확인하고 상세 정보를 비교해보세요.
                    </p>
                </div>
            </div>

            {filterOpen && (
                <MatchFilterModal
                    initialFilters={filters}
                    onClose={() => setFilterOpen(false)}
                    onApply={(nextFilters) => {
                        setFilters(nextFilters)
                        setFilterOpen(false)
                    }}
                    onReset={() => {
                        setFilters({ ...EMPTY_MATCH_FILTERS })
                        setFilterOpen(false)
                    }}
                />
            )}

            {loading && (
                <Loading message="AI 매칭 결과를 불러오는 중입니다." />
            )}

            {!loading &&
                error && (
                    <ErrorState
                        message={
                            error.message ||
                            "매칭 결과를 불러오지 못했습니다."
                        }
                        onRetry={
                            canRetry
                                ? () =>
                                    setRetryCount(
                                        (
                                            count
                                        ) =>
                                            count +
                                            1
                                    )
                                : undefined
                        }
                        onHome={() =>
                            navigate("/")
                        }
                    />
                )}

            {!loading && !error && (
                <FilterBar
                    total={resultTotal}
                    onOpenFilter={() => setFilterOpen(true)}
                    sort={sort}
                    onChangeSort={setSort}
                    chips={filterChips}
                    sortOptions={SORT_OPTIONS}
                />
            )}

            {!loading &&
                !error &&
                matches.length ===
                    0 && (
                    <Empty
                        message="현재 유사한 보호동물을 찾지 못했습니다."
                        action={
                            <div className="stack">
                                <p className="text-sub">
                                    새로운 보호동물이 등록되면 다시 확인해보세요.
                                </p>

                                <Link
                                    className="btn btn-outline"
                                    to="/ai-search"
                                    state={{
                                        lostPostId
                                    }}
                                >
                                    AI로 다시 찾기
                                </Link>
                            </div>
                        }
                    />
                )}

            {!loading &&
                !error &&
                matches.length >
                    0 && (
                    <section aria-label="AI 매칭 후보">
                        <p className="match-result-count">
                            유사한 후보{" "}
                            <strong>
                                {
                                    matches.length
                                }
                                건
                            </strong>
                        </p>

                        <PostGrid>
                            {matches.map(
                                (
                                    match,
                                    index
                                ) => (
                                    <MatchCard
                                        key={`${match.source_type}:${match.match_id ?? index}`}
                                        match={
                                            match
                                        }
                                    />
                                )
                            )}
                        </PostGrid>

                        {hasMore && (
                            <div className="stack">
                                <p className="text-sub">
                                    상위 후보에서 찾지 못하셨나요? 유사도가 낮은 다음 후보도 확인해보세요.
                                </p>

                                {loadMoreError && (
                                    <p
                                        className="form-error"
                                        role="alert"
                                    >
                                        {
                                            loadMoreError
                                        }
                                    </p>
                                )}

                                <button
                                    type="button"
                                    className="btn btn-outline btn-block"
                                    disabled={
                                        loadingMore
                                    }
                                    onClick={
                                        handleLoadMore
                                    }
                                >
                                    {loadingMore
                                        ? "다음 순위 후보를 찾고 있습니다..."
                                        : `${nextStart}~${nextEnd}위 후보 더 보기`}
                                </button>
                            </div>
                        )}

                        {!hasMore &&
                            resultLimit >
                                INITIAL_LIMIT && (
                                <p className="text-sub">
                                    확인 가능한 후보를 모두 확인했습니다.
                                </p>
                            )}
                    </section>
                )}
        </div>
    )
}
