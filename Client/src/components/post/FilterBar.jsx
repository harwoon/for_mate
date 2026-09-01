// 목록 상단의 "필터 / 총 N건 / 정렬" 줄
export default function FilterBar({ total, onOpenFilter, sort, onChangeSort, chips }) {
  return (
    <div className="stack">
      <div className="row-between">
        <button className="btn btn-outline" onClick={onOpenFilter}>필터</button>
        <span className="text-sub">총 {total ?? 0}건의 검색 결과</span>
        <select
          className="form-select"
          style={{ width: "auto" }}
          value={sort}
          onChange={(e) => onChangeSort(e.target.value)}
        >
          <option value="latest">최신 등록순</option>
        </select>
      </div>

      {/* 적용된 필터 조건을 칩으로 보여준다 */}
      {chips?.length > 0 && <div className="row">{chips}</div>}
    </div>
  )
}
