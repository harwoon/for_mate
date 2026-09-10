import * as repository from "./faqs.repository.js"

const FAQ_STATUSES = ["published", "draft"]

function serviceError(message, status, code) {
    const error = new Error(message)
    error.status = status
    error.code = code
    return error
}

function parseFaqId(rawFaqId) {
    const faqId = Number(rawFaqId)
    if (!Number.isInteger(faqId) || faqId <= 0) {
        throw serviceError("올바르지 않은 FAQ 번호입니다.", 400, "INVALID_FAQ_ID")
    }
    return faqId
}

function validateFaqContent(body) {
    const question = typeof body?.question === "string" ? body.question.trim() : ""
    const answer = typeof body?.answer === "string" ? body.answer.trim() : ""
    const status = body?.status ?? "published"

    if (!question) {
        throw serviceError("질문은 필수입니다.", 400, "MISSING_QUESTION")
    }
    if (question.length > 200) {
        throw serviceError("질문은 200자 이하여야 합니다.", 400, "INVALID_QUESTION_LENGTH")
    }
    if (!answer) {
        throw serviceError("답변은 필수입니다.", 400, "MISSING_ANSWER")
    }
    if (!FAQ_STATUSES.includes(status)) {
        throw serviceError("status는 published 또는 draft만 가능합니다.", 400, "INVALID_STATUS")
    }

    return { question, answer, status }
}

function toFaq(faq) {
    return {
        id: String(faq.id),
        question: faq.question,
        answer: faq.answer,
        display_order: Number(faq.display_order),
        status: faq.status,
        created_by: faq.created_by == null ? null : Number(faq.created_by),
        updated_by: faq.updated_by == null ? null : Number(faq.updated_by),
        created_at: faq.created_at,
        updated_at: faq.updated_at,
    }
}

export async function getFaqs() {
    return { items: await repository.findPublished() }
}

export async function getAdminFaqs() {
    return { items: (await repository.findAll()).map(toFaq) }
}

export async function createFaq(adminUserId, body) {
    return toFaq(await repository.create(validateFaqContent(body), adminUserId))
}

export async function updateFaq(adminUserId, rawFaqId, body) {
    const faq = await repository.update(
        parseFaqId(rawFaqId),
        validateFaqContent(body),
        adminUserId
    )
    if (!faq) {
        throw serviceError("FAQ를 찾을 수 없습니다.", 404, "FAQ_NOT_FOUND")
    }
    return toFaq(faq)
}

export async function updateFaqStatus(adminUserId, rawFaqId, rawStatus) {
    const faqId = parseFaqId(rawFaqId)
    const status = typeof rawStatus === "string" ? rawStatus.trim() : ""
    if (!FAQ_STATUSES.includes(status)) {
        throw serviceError("status는 published 또는 draft만 가능합니다.", 400, "INVALID_STATUS")
    }

    const faq = await repository.updateStatus(faqId, status, adminUserId)
    if (!faq) {
        throw serviceError("FAQ를 찾을 수 없습니다.", 404, "FAQ_NOT_FOUND")
    }
    return toFaq(faq)
}

export async function updateFaqOrder(adminUserId, rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw serviceError("변경할 FAQ 순서가 필요합니다.", 400, "MISSING_FAQ_ORDER")
    }

    const items = rawItems.map((item) => ({
        id: parseFaqId(item?.id),
        display_order: Number(item?.display_order),
    }))
    const ids = items.map((item) => item.id)
    const orders = items.map((item) => item.display_order)

    if (new Set(ids).size !== ids.length) {
        throw serviceError("FAQ 번호가 중복되었습니다.", 400, "DUPLICATE_FAQ_ID")
    }
    if (
        orders.some((order) => !Number.isInteger(order) || order <= 0) ||
        new Set(orders).size !== orders.length ||
        ![...orders].sort((a, b) => a - b).every((order, index) => order === index + 1)
    ) {
        throw serviceError("display_order는 1부터 중복 없이 입력해야 합니다.", 400, "INVALID_DISPLAY_ORDER")
    }

    try {
        return { items: (await repository.updateOrder(items, adminUserId)).map(toFaq) }
    } catch (error) {
        if (error.code === "FAQ_ORDER_MISMATCH") {
            throw serviceError("모든 FAQ를 빠짐없이 전달해야 합니다.", 400, "FAQ_ORDER_MISMATCH")
        }
        throw error
    }
}

export async function deleteFaq(rawFaqId) {
    const faq = await repository.remove(parseFaqId(rawFaqId))
    if (!faq) {
        throw serviceError("FAQ를 찾을 수 없습니다.", 404, "FAQ_NOT_FOUND")
    }
    return { id: String(faq.id) }
}
