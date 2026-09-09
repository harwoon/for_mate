// 목록 상단의 "필터 / 총 N건 / 정렬" 줄
export default function FilterBar({
    total,
    onOpenFilter,
    sort,
    onChangeSort,
    chips
}) {
    return (
        <div className="stack filter-bar">
            <div className="row-between filter-toolbar">
                <button
                    type="button"
                    className="btn btn-outline filter-trigger-button"
                    onClick={onOpenFilter}
                >
                    <i
                        className="ri-align-justify"
                        aria-hidden="true"
                    />
                    <span>필터</span>
                </button>

                <div className="filter-toolbar-right">
                    <span className="text-sub filter-result-count">
                        총 {total ?? 0}건의 검색 결과
                    </span>

                    <select
                        className="form-select filter-sort-select"
                        style={{ width: "auto" }}
                        value={sort}
                        onChange={(event) => (
                            onChangeSort(event.target.value)
                        )}
                        aria-label="목록 정렬"
                    >
                        <option value="latest">
                            최신 등록순
                        </option>
                    </select>
                </div>
            </div>

            {chips?.length > 0 && (
                <div className="filter-chip-row">
                    {chips.map((chip) => (
                        <span
                            key={chip.key}
                            className="filter-chip"
                        >
                            <span>
                                {chip.label}
                            </span>

                            <button
                                type="button"
                                className="filter-chip-remove"
                                onClick={chip.onRemove}
                                aria-label={`${chip.label} 필터 해제`}
                            >
                                <i
                                    className="ri-close-line"
                                    aria-hidden="true"
                                />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}