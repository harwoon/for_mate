import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { getFoundPosts } from "../../api/foundPosts.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import Pagination from "../../components/common/Pagination.jsx"
import FilterBar from "../../components/post/FilterBar.jsx"
import FilterModal from "../../components/post/FilterModal.jsx"

const PAGE_SIZE = 20

const EMPTY_FILTERS = {
    species: "",
    breed: "",
    colors: [],
    sido: "",
    sigungu: "",
    start_date: "",
    end_date: ""
}

function formatCreatedAt(value) {
    if (!value) return "-"

    return String(value)
        .slice(0, 16)
        .replace("T", " ")
        .replaceAll("-", ".")
}

export default function FoundListPage() {
    const navigate = useNavigate()

    const [filters, setFilters] = useState(EMPTY_FILTERS)
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [sort, setSort] = useState("latest")
    const [page, setPage] = useState(1)

    const [posts, setPosts] = useState([])
    const [total, setTotal] = useState(0)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function loadPosts() {
            setLoading(true)
            setError("")

            const region = [filters.sido, filters.sigungu]
                .filter(Boolean)
                .join(" ")

            try {
                const result = await getFoundPosts({
                    page,
                    size: PAGE_SIZE,
                    species: filters.species,
                    breed: filters.breed,
                    color: filters.colors.join(","),
                    region,
                    start_date: filters.start_date,
                    end_date: filters.end_date,
                    sort
                })

                if (cancelled) return

                setPosts(result?.items ?? [])
                setTotal(result?.total ?? 0)
            } catch (error) {
                if (!cancelled) {
                    setPosts([])
                    setTotal(0)
                    setError(
                        error.message ||
                        "발견제보 게시글을 불러오지 못했습니다."
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
    }, [filters, page, sort, retryCount])

    function handleApplyFilters(nextFilters) {
        setFilters(nextFilters)
        setPage(1)
        setIsFilterOpen(false)
    }

    function handleResetFilters() {
        setFilters({
            ...EMPTY_FILTERS,
            colors: []
        })

        setPage(1)
    }

    function handleChangeSort(nextSort) {
        setSort(nextSort)
        setPage(1)
    }
    function handleRemoveFilter(field, value) {
        setFilters((current) => {
            if (field === "colors") {
                return {
                    ...current,
                    colors: current.colors.filter(
                        (color) => color !== value
                    )
                }
            }

            if (field === "region") {
                return {
                    ...current,
                    sido: "",
                    sigungu: ""
                }
            }

            return {
                ...current,
                [field]: ""
            }
        })

        setPage(1)
    }

    const filterChips = [
        filters.species && {
            key: "species",
            label: filters.species,
            onRemove: () => (
                handleRemoveFilter("species")
            )
        },

        filters.breed && {
            key: "breed",
            label: filters.breed,
            onRemove: () => (
                handleRemoveFilter("breed")
            )
        },

        ...filters.colors.map((color) => ({
            key: `color-${color}`,
            label: color,
            onRemove: () => (
                handleRemoveFilter(
                    "colors",
                    color
                )
            )
        })),

        (filters.sido || filters.sigungu) && {
            key: "region",
            label: [
                filters.sido,
                filters.sigungu
            ]
                .filter(Boolean)
                .join(" "),
            onRemove: () => (
                handleRemoveFilter("region")
            )
        },

        filters.start_date && {
            key: "start-date",
            label: `시작일 ${filters.start_date}`,
            onRemove: () => (
                handleRemoveFilter("start_date")
            )
        },

        filters.end_date && {
            key: "end-date",
            label: `종료일 ${filters.end_date}`,
            onRemove: () => (
                handleRemoveFilter("end_date")
            )
        }
    ].filter(Boolean)

    return (
        <div className="container">
            <Breadcrumb
                items={[
                    { label: "홈", to: "/" },
                    { label: "발견제보" }
                ]}
            />

            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        발견제보
                    </h1>

                    <p className="page-desc">
                        시민들이 직접 발견한 동물 제보를 확인할 수 있습니다.
                    </p>
                </div>

                <Link
                    to="/found-posts/new"
                    className="btn btn-primary"
                >
                    발견제보 작성
                </Link>
            </div>

            <FilterBar
                total={total}
                onOpenFilter={() => setIsFilterOpen(true)}
                sort={sort}
                onChangeSort={handleChangeSort}
                chips={filterChips}
            />

            {isFilterOpen && (
                <FilterModal
                    initialFilters={filters}
                    dateTitle="발견 날짜"
                    onClose={() => setIsFilterOpen(false)}
                    onApply={handleApplyFilters}
                    onReset={handleResetFilters}
                />
            )}

            {loading && (
                <Loading message="발견제보 게시글을 불러오는 중입니다." />
            )}

            {!loading && error && (
                <ErrorState
                    message={error}
                    onRetry={() => (
                        setRetryCount((count) => count + 1)
                    )}
                    onHome={() => navigate("/")}
                />
            )}

            {!loading && !error && posts.length === 0 && (
                <Empty message="조건에 맞는 발견제보가 없습니다." />
            )}

            {!loading && !error && posts.length > 0 && (
                <>
                    <table className="board-table">
                        <thead>
                            <tr>
                                <th>번호</th>
                                <th>제목</th>
                                <th>발견 위치</th>
                                <th>등록 시간</th>
                            </tr>
                        </thead>

                        <tbody>
                            {posts.map((post) => (
                                <tr key={post.id}>
                                    <td>{post.no}</td>

                                    <td>
                                        <Link
                                            to={`/found-posts/${post.id}`}
                                        >
                                            {post.title}
                                        </Link>
                                    </td>

                                    <td>
                                        {post.region || "-"}
                                    </td>

                                    <td>
                                        {formatCreatedAt(post.created_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <Pagination
                        page={page}
                        total={total}
                        size={PAGE_SIZE}
                        onChange={setPage}
                    />
                </>
            )}
        </div>
    )
}