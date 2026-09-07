import * as repository from "./reports.repository.js"
const POST_TYPES = ["lost", "found"]

const REPORT_REASONS = [
    "허위정보",
    "부적절한내용또는이미지",
    "광고홍보",
    "개인정보노출",
    "기타"
]

function serviceError(message, status, code) {
    const error = new Error(message)
    error.status = status
    error.code = code
    return error
}

export async function createReport(userId, body) {
    const postId = Number(body.post_id)
    const postType = body.post_type?.trim()
    const reason = body.reason?.trim()
    const detail = body.detail?.trim() || null

    if (!Number.isInteger(postId) || postId <= 0 || !postType || !reason) {
        throw serviceError("필수값이 누락되었습니다.", 400, "MISSING_FIELD")
    }

    if (!POST_TYPES.includes(postType)) {
        throw serviceError("post_type 값이 올바르지 않습니다.", 400, "INVALID_POST_TYPE")
    }

    if (!REPORT_REASONS.includes(reason)) {
        throw serviceError("신고 사유가 올바르지 않습니다.", 400, "INVALID_REASON")
    }

    const duplicate = await repository.findDuplicate({
        userId,
        postId,
        postType
    })

    if (duplicate) {
        throw serviceError("이미 신고한 게시글입니다.", 409, "DUPLICATE_REPORT")
    }

    const report = await repository.create({
        userId,
        postId,
        postType,
        reason,
        detail
    })

    return {
        report_id: Number(report.id),
        post_id: Number(report.post_id),
        post_type: report.post_type,
        status: report.status,
        created_at: report.created_at
    }
}