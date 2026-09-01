// 목록 하단 페이지 번호
export default function Pagination({ page, total, size = 20, onChange }) {
  const lastPage = Math.max(1, Math.ceil((total || 0) / size))
  const pages = Array.from({ length: lastPage }, (_, i) => i + 1)

  if (lastPage <= 1) return null

  return (
    <div className="pagination">
      {pages.map((n) => (
        <button
          key={n}
          className={n === page ? "is-active" : ""}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
