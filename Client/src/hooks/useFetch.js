import { useEffect, useState } from "react"

// 목록/상세 조회처럼 "화면 열릴 때 한 번 불러오는" 경우에 쓴다.
// 사용 예: const { data, loading, error } = useFetch(() => getLostPosts({ page }), [page])
export function useFetch(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetcher()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // 응답이 오기 전에 화면을 벗어나면 결과를 무시한다.
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}
