import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import { getRescueAnimals } from "../../api/rescueAnimals.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import Pagination from "../../components/common/Pagination.jsx"
import FilterBar from "../../components/post/FilterBar.jsx"
import FilterModal from "../../components/post/FilterModal.jsx"
import PostCard from "../../components/post/PostCard.jsx"
import PostGrid from "../../components/post/PostGrid.jsx"

const PAGE_SIZE = 12

const EMPTY_FILTERS = {
    species: "",
    breed: "",
    colors: [],
    sido: "",
    sigungu: "",
    start_date: "",
    end_date: ""
}

function isEndingSoon(daysUntilEnd) {
    const days = Number(daysUntilEnd)

    return (
        Number.isFinite(days) &&
        days >= 0 &&
        days <= 3
    )
}

function getDetailPath(animal) {
    if (
        animal.source_type &&
        animal.animal_id
    ) {
        return `/rescue-animals/${animal.source_type}/${animal.animal_id}`
    }

    return `/rescue-animals/${animal.desertion_no}`
}

export default function RescueListPage() {
    const navigate = useNavigate()

    const [filters, setFilters] = useState(EMPTY_FILTERS)
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [sort, setSort] = useState("latest")
    const [page, setPage] = useState(1)

    const [animals, setAnimals] = useState([])
    const [total, setTotal] = useState(0)
    const [responsePage, setResponsePage] = useState(1)
    const [responseSize, setResponseSize] = useState(PAGE_SIZE)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [retryCount, setRetryCount] = useState(0)

    useEffect(() => {
        let cancelled = false

        async function loadAnimals() {
            setLoading(true)
            setError("")

            try {
                const result = await getRescueAnimals({
                    page,
                    size: PAGE_SIZE,
                    species: filters.species,
                    breed: filters.breed,
                    color: filters.colors,
                    sido: filters.sido,
                    sigungu: filters.sigungu,
                    start_date: filters.start_date,
                    end_date: filters.end_date
                })

                if (cancelled) return

                setAnimals(result?.items ?? [])
                setTotal(result?.total ?? 0)
                setResponsePage(result?.page ?? page)
                setResponseSize(
                    result?.size ?? PAGE_SIZE
                )
            } catch (error) {
                if (!cancelled) {
                    setAnimals([])
                    setTotal(0)

                    setError(
                        error.message ||
                        "보호중인 동물을 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadAnimals()

        return () => {
            cancelled = true
        }
    }, [
        filters,
        page,
        sort,
        retryCount
    ])

    function handleApplyFilters(nextFilters) {
        setFilters(nextFilters)
        setPage(1)
        setIsFilterOpen(false)
    }

    // 필터 값만 초기화하고 모달은 그대로 유지한다.
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

    // 적용된 필터 chip의 X를 눌렀을 때 해당 조건만 제거한다.
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
                    {
                        label: "홈",
                        to: "/"
                    },
                    {
                        label: "보호중이에요"
                    }
                ]}
            />

            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        보호중이에요
                    </h1>

                    <p className="page-desc">
                        현재 보호 중인 구조동물을 확인할 수 있습니다.
                    </p>
                </div>
            </div>

            <FilterBar
                total={total}
                onOpenFilter={() => (
                    setIsFilterOpen(true)
                )}
                sort={sort}
                onChangeSort={handleChangeSort}
                chips={filterChips}
            />

            {isFilterOpen && (
                <FilterModal
                    initialFilters={filters}
                    dateTitle="구조 날짜"
                    onClose={() => (
                        setIsFilterOpen(false)
                    )}
                    onApply={handleApplyFilters}
                    onReset={handleResetFilters}
                />
            )}

            {!error && (
                <Loading
                    loading={loading}
                    message="보호중인 동물을 불러오는 중입니다."
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

            {!loading &&
                !error &&
                animals.length === 0 && (
                    <Empty message="조건에 맞는 보호동물이 없습니다." />
                )}

            {!loading &&
                !error &&
                animals.length > 0 && (
                    <>
                        <PostGrid>
                            {animals.map((animal) => {
                                const endingSoon =
                                    isEndingSoon(
                                        animal.days_until_end
                                    )

                                return (
                                    <PostCard
                                        key={`${animal.source_type}-${animal.animal_id}`}
                                        to={getDetailPath(animal)}
                                        thumbnail={imageUrl(
                                            animal.image_url
                                        )}
                                        badgeType={
                                            endingSoon
                                                ? "ending"
                                                : "rescue"
                                        }
                                        badgeText={
                                            endingSoon
                                                ? "보호종료 예정"
                                                : "보호중"
                                        }
                                        breed={
                                            animal.breed ||
                                            animal.species
                                        }
                                        region={
                                            animal.happen_place ||
                                            "-"
                                        }
                                        date={
                                            animal.happen_dt ||
                                            "-"
                                        }
                                    />
                                )
                            })}
                        </PostGrid>

                        <Pagination
                            page={responsePage}
                            total={total}
                            size={responseSize}
                            onChange={setPage}
                        />
                    </>
                )}
        </div>
    )
}