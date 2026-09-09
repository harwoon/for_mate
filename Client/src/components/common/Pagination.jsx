// 목록 하단 페이지네이션
export default function Pagination({
    page,
    total,
    size = 20,
    onChange
}) {
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
        if (lastPage <= 6) {
            return Array.from(
                { length: lastPage },
                (_, index) => index + 1
            )
        }

        const items = [1, 2, 3, 4]

        if (
            currentPage > 4 &&
            currentPage < lastPage - 1
        ) {
            if (currentPage > 5) {
                items.push("ellipsis-middle-left")
            }

            items.push(currentPage)

            if (currentPage < lastPage - 2) {
                items.push("ellipsis-middle-right")
            }
        } else {
            items.push("ellipsis-middle")
        }

        items.push(lastPage - 1, lastPage)

        return [...new Set(items)]
    }

    const pageItems = getPageItems()

    return (
        <nav
            className="pagination"
            aria-label="페이지 이동"
        >
            <button
                type="button"
                className="pagination-nav"
                onClick={() => changePage(1)}
                disabled={currentPage === 1}
                aria-label="첫 페이지"
                title="첫 페이지"
            >
                «
            </button>

            <button
                type="button"
                className="pagination-nav"
                onClick={() => changePage(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="이전 페이지"
                title="이전 페이지"
            >
                ‹
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
                ›
            </button>

            <button
                type="button"
                className="pagination-nav"
                onClick={() => changePage(lastPage)}
                disabled={currentPage === lastPage}
                aria-label="마지막 페이지"
                title="마지막 페이지"
            >
                »
            </button>
        </nav>
    )
}