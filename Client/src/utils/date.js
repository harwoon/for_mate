const seoulFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
})

function parseTimestamp(value) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value
    }

    // 시간대 없는 문자열을 브라우저 로컬 시각으로 해석하지 않는다.
    // 이전 API의 UTC timestamp 문자열도 명시적으로 UTC로 해석한다.
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
        return null
    }

    const normalized = value.trim().replace(" ", "T")
    const timestamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
        ? normalized
        : `${normalized}Z`
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? null : date
}

function timestampParts(value) {
    const date = parseTimestamp(value)
    if (!date) return null
    return Object.fromEntries(
        seoulFormatter.formatToParts(date).map(({ type, value }) => [type, value])
    )
}

export function formatDateTime(value, fallback = "-") {
    const parts = timestampParts(value)
    if (!parts) return fallback
    return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}

export function formatTimestampDate(value, fallback = "-") {
    const parts = timestampParts(value)
    if (!parts) return fallback
    return `${parts.year}.${parts.month}.${parts.day}`
}

// DATE는 시각이 아니므로 Date 생성 및 시간대 변환 없이 표시한다.
export function formatDate(value, fallback = "-") {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return fallback
    }
    return value.replaceAll("-", ".")
}

export function formatRelativeTime(value, now = Date.now()) {
    const date = parseTimestamp(value)
    if (!date) return "-"
    const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000))
    if (seconds < 60) return "방금 전"
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}일 전`
    return formatTimestampDate(value)
}
