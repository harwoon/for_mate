import * as repository from "./my.repository.js"

function serviceError(message, status, code) {
    const error = new Error(message)
    error.status = status
    error.code = code
    return error
}

function parsePagingValue(value, defaultValue, fieldName, maxValue) {
    if (value === undefined || value === "") return defaultValue

    const number = Number(value)
    if (!Number.isInteger(number) || number <= 0 || number > maxValue) {
        throw serviceError(
            `${fieldName} 값이 올바르지 않습니다.`,
            400,
            "INVALID_PAGINATION"
        )
    }

    return number
}



function parseStatus(value) {
    if (value === undefined || value === null || value === "") return null

    const status = String(value).trim()
    if (!["active", "blind"].includes(status)) {
        throw serviceError("status 값이 올바르지 않습니다.", 400, "INVALID_STATUS")
    }

    return status
}

function formatDateOnly(value) {
    if (value === null || value === undefined) return null
    if (typeof value === "string") return value.slice(0, 10)
    if (value instanceof Date) return value.toISOString().slice(0, 10)
    return String(value).slice(0, 10)
}

function formatLostPost(post) {
    if (!post) return null

    return {
        ...post,
        event_date: formatDateOnly(post.event_date)
    }
}

function formatFoundPost(post) {
    if (!post) return null

    return {
        ...post,
        find_date: formatDateOnly(post.find_date)
    }
}

// 8.1 마이페이지 요약 조회
export async function getSummary(userId) {
    const result = await repository.findSummary(userId)

    return {
        counts: result.counts,
        recent_lost_post: formatLostPost(result.recentLostPost),
        recent_found_post: formatFoundPost(result.recentFoundPost),
        match_previews: result.matchPreviews,
        bookmark_previews: result.bookmarkPreviews
    }
}

function parseListQuery(query) {
    const page = parsePagingValue(query.page, 1, "page", Number.MAX_SAFE_INTEGER)
    const size = parsePagingValue(query.size, 10, "size", 100)
    const status = parseStatus(query.status)

    return {
        page,
        size,
        status,
        offset: (page - 1) * size
    }
}

// 8.2 내 실종 공고 목록 조회
export async function getMyLostPosts({ userId, query }) {
    const { page, size, status, offset } = parseListQuery(query)
    const { items, total } = await repository.findMyLostPosts({
        userId,
        status,
        size,
        offset
    })

    return {
        items: items.map(formatLostPost),
        pagination: {
            page,
            size,
            total,
            total_pages: Math.ceil(total / size)
        }
    }
}

// 8.3 내 발견제보 목록 조회
export async function getMyFoundPosts({ userId, query }) {
    const { page, size, status, offset } = parseListQuery(query)
    const { items, total } = await repository.findMyFoundPosts({
        userId,
        status,
        size,
        offset
    })

    return {
        items: items.map(formatFoundPost),
        pagination: {
            page,
            size,
            total,
            total_pages: Math.ceil(total / size)
        }
    }
}

// 8.4 내 매칭 기록 목록 조회
export async function getMyMatches({ userId, query }) {
    const page = parsePagingValue(query.page, 1, "page", Number.MAX_SAFE_INTEGER)
    const size = parsePagingValue(query.size, 10, "size", 100)

    let lostPostId = null
    if (query.lost_post_id !== undefined) {
        lostPostId = Number(query.lost_post_id)
        if (!Number.isInteger(lostPostId) || lostPostId <= 0) {
            throw serviceError("lost_post_id 값이 올바르지 않습니다.", 400, "INVALID_LOST_POST_ID")
        }
    }

    const offset = (page - 1) * size
    const { items, total } = await repository.findMyMatches({ userId, lostPostId, size, offset })

    return {
        items: items.map(toMatchItem),
        pagination: { page, size, total, total_pages: Math.ceil(total / size) }
    }
}

function toMatchItem(match) {
    return {
        id: Number(match.id),
        lost_post: { id: Number(match.lost_post_id), pet_name: match.pet_name, species: match.lost_species },
        animal: {
            source_type: match.source_type,
            id: Number(match.source_type === "rescue" ? match.desertion_no : match.pawinhand_animal_id),
            up_kind_nm: match.up_kind_nm,
            kind_nm: match.kind_nm,
            image_url: match.animal_image_url
        },
        similarity_score: Number(match.similarity_score),
        matched_date: match.matched_date,
        created_at: match.created_at
    }
}