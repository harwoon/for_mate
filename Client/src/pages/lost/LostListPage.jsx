// 피그마: U-02 찾고있어요
//
// 구현할 내용:
// - FilterBar + FilterModal 연결
// - getLostPosts로 목록 조회 후 PostGrid + PostCard 렌더
// - Pagination 연결
// - 결과 0건이면 Empty (U-02-N01)

import { useEffect, useState } from "react"
import { getLostPosts } from "../../api/lostPosts.api.js"
import FilterBar from "../../components/post/FilterBar.jsx"
import FilterModal from "../../components/post/FilterModal.jsx"
import PostGrid from "../../components/post/PostGrid.jsx"
import PostCard from "../../components/post/PostCard.jsx"
import Pagination from "../../components/common/Pagination.jsx"
import Loading from "../../components/common/Loading.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Empty from "../../components/common/Empty.jsx"

const PAGE_SIZE = 20

const EMPTY_FILTERS = {
  species: "",
  breed: "",
  colors: [],
  sido: "",
  sigungu: "",
  start_date: "",
  end_date: "",
}

export default function LostListPage() {
  // 모달 안의 임시 선택과 구분되는, 실제 목록 조회에 적용된 필터이다.
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [sort, setSort] = useState("latest")
  const [page, setPage] = useState(1)
  const [posts, setPosts] = useState([])
  const [pagination, setPagination] = useState({
    page: 1,
    size: PAGE_SIZE,
    total: 0,
    total_pages: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [retryCount, setRetryCount] = useState(0)

  // 페이지 또는 적용 필터가 바뀔 때마다 서버에서 목록을 다시 가져온다.
  useEffect(() => {
    let cancelled = false

    async function loadPosts() {
      setLoading(true)
      setError("")

      // 화면에서는 시/도와 시/군/구를 따로 관리하지만 서버에는 region 하나로 보낸다.
      const region = [filters.sido, filters.sigungu]
        .filter(Boolean)
        .join(" ")

      try {
        const result = await getLostPosts({
          page,
          size: PAGE_SIZE,
          species: filters.species,
          breed: filters.breed,
          colors: filters.colors.join(","),
          region,
          start_date: filters.start_date,
          end_date: filters.end_date,
          sort,
        })

        if (cancelled) return
        setPosts(result?.items ?? [])
        setPagination(result?.pagination ?? {
          page,
          size: PAGE_SIZE,
          total: 0,
          total_pages: 0,
        })
      } catch (err) {
        if (!cancelled) {
          setPosts([])
          setError(err.message || "실종 공고를 불러오지 못했습니다.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPosts()
    return () => { cancelled = true }
  }, [filters, page, sort, retryCount])

  // 모달의 검색하기 버튼이 전달한 값을 실제 필터로 확정한다.
  function handleApplyFilters(nextFilters) {
    setFilters(nextFilters)
    setPage(1)
    setIsFilterOpen(false)
  }

  // 필터를 모두 해제하고 첫 페이지부터 전체 목록을 다시 조회한다.
  function handleResetFilters() {
    setFilters({ ...EMPTY_FILTERS, colors: [] })
    setPage(1)
    setIsFilterOpen(false)
  }

  function handleChangeSort(nextSort) {
    setSort(nextSort)
    setPage(1)
  }

  // 적용된 조건을 목록 상단에서 확인할 수 있도록 표시용 문자열을 만든다.
  const filterLabels = [
    filters.species,
    filters.breed,
    ...filters.colors,
    [filters.sido, filters.sigungu].filter(Boolean).join(" "),
    filters.start_date && `시작일 ${filters.start_date}`,
    filters.end_date && `종료일 ${filters.end_date}`,
  ].filter(Boolean)

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">찾고있어요</h1>
      </div>

      <FilterBar
        total={pagination.total}
        onOpenFilter={() => setIsFilterOpen(true)}
        sort={sort}
        onChangeSort={handleChangeSort}
        chips={filterLabels.map((label, index) => (
          <span className="badge" key={`${label}-${index}`}>{label}</span>
        ))}
      />

      {isFilterOpen && (
        <FilterModal
          initialFilters={filters}
          onClose={() => setIsFilterOpen(false)}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
        />
      )}

      {loading && <Loading message="실종 공고를 불러오는 중입니다." />}

      {!loading && error && (
        <ErrorState
          message={error}
          onRetry={() => setRetryCount((count) => count + 1)}
        />
      )}

      {!loading && !error && posts.length === 0 && (
        <Empty message="조건에 맞는 실종 공고가 없습니다." />
      )}

      {!loading && !error && posts.length > 0 && (
        <>
          <PostGrid>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                to={`/lost-posts/${post.id}`}
                thumbnail={post.first_image_url}
                badgeType="lost"
                badgeText="실종"
                breed={post.breed || post.species}
                region={post.region}
                date={post.event_date?.slice(0, 10)}
              />
            ))}
          </PostGrid>

          <Pagination
            page={pagination.page ?? page}
            total={pagination.total}
            size={pagination.size ?? PAGE_SIZE}
            onChange={setPage}
          />
        </>
      )}
    </div>
  )
}
