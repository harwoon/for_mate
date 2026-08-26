// 목록 조회 API에서 page, size 값을 정리한다
export function getPaging(query) {
  const page = Number(query.page) || 1
  const size = Number(query.size) || 20
  const offset = (page - 1) * size

  return { page, size, offset }
}
