import { useState } from "react"

// 목록 하단 페이지네이션
export default function Pagination({
    page,
    total,
    size = 20,
    onChange
}) {
    const [pageInput, setPageInput] = useState("")

    const lastPage = Math.max(
        1,
        Math.ceil((total || 0) / size)
    )

    const currentPage = Math.min(
        Math.max(Number(page) || 1, 1),
        lastPage
    )

    if (lastPage <= 1) return null

    function changePage(nextPage) {
        if (
            nextPage < 1 ||
            nextPage > lastPage ||
            nextPage === currentPage
        ) {
            return
        }

        onChange(nextPage)
    }

    function getPageItems() {
        if (lastPage <= 9) {
            return Array.from(
                { length: lastPage },
                (_, index) => index + 1
            )
        }

        const visiblePages = new Set([
            1,
            2,
            lastPage - 1,
            lastPage
        ])

        for (
            let target = currentPage - 2;
            target <= currentPage + 2;
            target += 1
        ) {
            if (target >= 1 && target <= lastPage) {
                visiblePages.add(target)
            }
        }

        const pages = [...visiblePages].sort((a, b) => a - b)
        const items = []

        pages.forEach((target, index) => {
            const previous = pages[index - 1]

            if (previous && target - previous > 1) {
                items.push(`ellipsis-${previous}-${target}`)
            }

            items.push(target)
        })

        return items
    }

    function handlePageSearch(event) {
        event.preventDefault()

        const requestedPage = Number(pageInput)

        if (!Number.isInteger(requestedPage)) {
            return
        }

        const nextPage = Math.min(
            Math.max(requestedPage, 1),
            lastPage
        )

        setPageInput("")
        changePage(nextPage)
    }

    const pageItems = getPageItems()

    return (
        <nav
            className="pagination"
            aria-label="페이지 이동"
        >
            <div className="pagination-pages">
                <button
                    type="button"
                    className="pagination-nav"
                    onClick={() => changePage(1)}
                    disabled={currentPage === 1}
                    aria-label="첫 페이지"
                    title="첫 페이지"
                >
                    <i
                        className="ri-arrow-left-double-line"
                        aria-hidden="true"
                    />
                </button>

                <button
                    type="button"
                    className="pagination-nav"
                    onClick={() => changePage(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="이전 페이지"
                    title="이전 페이지"
                >
                    <i
                        className="ri-arrow-left-s-line"
                        aria-hidden="true"
                    />
                </button>

                {pageItems.map((item) => {
                    if (String(item).startsWith("ellipsis")) {
                        return (
                            <span
                                key={item}
                                className="pagination-ellipsis"
                            >
                                …
                            </span>
                        )
                    }

                    return (
                        <button
                            type="button"
                            key={item}
                            className={
                                item === currentPage
                                    ? "is-active"
                                    : ""
                            }
                            onClick={() => changePage(item)}
                            aria-current={
                                item === currentPage
                                    ? "page"
                                    : undefined
                            }
                        >
                            {item}
                        </button>
                    )
                })}

                <button
                    type="button"
                    className="pagination-nav"
                    onClick={() => changePage(currentPage + 1)}
                    disabled={currentPage === lastPage}
                    aria-label="다음 페이지"
                    title="다음 페이지"
                >
                    <i
                        className="ri-arrow-right-s-line"
                        aria-hidden="true"
                    />
                </button>

                <button
                    type="button"
                    className="pagination-nav"
                    onClick={() => changePage(lastPage)}
                    disabled={currentPage === lastPage}
                    aria-label="마지막 페이지"
                    title="마지막 페이지"
                >
                    <i
                        className="ri-arrow-right-double-line"
                        aria-hidden="true"
                    />
                </button>
            </div>

            <form
                className="pagination-search"
                onSubmit={handlePageSearch}
            >
                <input
                    id="pagination-page-input"
                    type="number"
                    min="1"
                    max={lastPage}
                    inputMode="numeric"
                    value={pageInput}
                    onChange={(event) =>
                        setPageInput(event.target.value)
                    }
                    placeholder="페이지"
                    aria-label={`이동할 페이지 번호, 전체 ${lastPage}페이지`}
                />

                <span aria-hidden="true">
                    {lastPage}
                </span>

                <button
                    type="submit"
                    className="pagination-search-button"
                    disabled={!pageInput}
                    aria-label="입력한 페이지로 이동"
                    title="페이지 이동"
                >
                    <i
                        className="ri-search-line"
                        aria-hidden="true"
                    />
                </button>
            </form>
        </nav>
    )
}
