const FILTER_KEYS = [
    "species",
    "breed",
    "sido",
    "sigungu",
    "start_date",
    "end_date"
]

export function readListQuery(searchParams, allowedSorts) {
    const filters = {
        species: "",
        breed: "",
        colors: [],
        sido: "",
        sigungu: "",
        start_date: "",
        end_date: ""
    }

    FILTER_KEYS.forEach((key) => {
        filters[key] = searchParams.get(key) ?? ""
    })

    filters.colors = (searchParams.get("colors") ?? "")
        .split(",")
        .map((color) => color.trim())
        .filter(Boolean)

    const rawPage = Number(searchParams.get("page"))
    const page = Number.isInteger(rawPage) && rawPage > 0
        ? rawPage
        : 1

    const requestedSort = searchParams.get("sort") ?? "latest"
    const sort = allowedSorts.includes(requestedSort)
        ? requestedSort
        : "latest"

    return { filters, page, sort }
}

export function createListQuery({ filters, page, sort }) {
    const params = new URLSearchParams()

    FILTER_KEYS.forEach((key) => {
        if (filters[key]) params.set(key, filters[key])
    })

    if (filters.colors.length > 0) {
        params.set("colors", filters.colors.join(","))
    }

    if (page > 1) params.set("page", String(page))
    if (sort !== "latest") params.set("sort", sort)

    return params
}
