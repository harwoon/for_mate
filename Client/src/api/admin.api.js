import {
    get,
    patch
} from "./client.js"

// 관리자 대시보드
export const getAdminDashboard = () => (
    get("/admin/dashboard")
)

// 실종 공고 관리
export const getAdminLostPosts = (params = {}) => {
    const search = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            search.append(key, value)
        }
    })

    const query = search.toString()

    return get(
        `/admin/lost-posts${query ? `?${query}` : ""}`
    )
}

// 발견제보 관리
export const getAdminFoundPosts = (params = {}) => {
    const search = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            search.append(key, value)
        }
    })

    const query = search.toString()

    return get(
        `/admin/found-posts${query ? `?${query}` : ""}`
    )
}

// 신고 관리
export const getAdminReports = (params = {}) => {
    const search = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            search.append(key, value)
        }
    })

    const query = search.toString()

    return get(
        `/admin/reports${query ? `?${query}` : ""}`
    )
}

export const updateAdminReport = (
    reportId,
    status
) => (
    patch(
        `/admin/reports/${reportId}`,
        { status }
    )
)

// 문의 관리
export const getAdminInquiries = () => (
    get("/admin/inquiries")
)

export const getAdminInquiry = (inquiryId) => (
    get(`/admin/inquiries/${inquiryId}`)
)

export const answerAdminInquiry = (
    inquiryId,
    answer
) => (
    patch(
        `/admin/inquiries/${inquiryId}`,
        { answer }
    )
)

// AI 매칭 기록
export const getAdminMatches = (params = {}) => {
    const search = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
        if (
            value !== undefined &&
            value !== null &&
            value !== ""
        ) {
            search.append(key, value)
        }
    })

    const query = search.toString()

    return get(
        `/admin/matches${query ? `?${query}` : ""}`
    )
}