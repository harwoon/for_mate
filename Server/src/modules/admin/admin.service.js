import * as repository from "./admin.repository.js"

// 상태 코드(status)와 에러 코드(code)를 담은 Error를 만든다.
// inquiries.service.js의 동일 헬퍼와 같은 패턴 (프로젝트 전체 컨벤션).
function serviceError(message, status, code) {
	const error = new Error(message)
	error.status = status
	error.code = code
	return error
}

// DB row(snake_case)를 "문의 관리" 목록 응답 형태로 변환한다.
// - 관리자 화면이라 user_id(누가 문의했는지)를 그대로 보여준다.
// - content/answer처럼 긴 텍스트는 목록에서는 굳이 안 보여줘도 되므로 제외한다.
//   (필요하면 상세 조회 API를 별도로 만들어서 그때 content/answer를 내려주면 된다)
function toInquiryListItem(inquiry) {
	return {
        inquiry_id: Number(inquiry.id),
        user_id: Number(inquiry.user_id),
        type: inquiry.type,
        title: inquiry.title,
        status: inquiry.status,
        created_at: inquiry.created_at
	}
}

function toInquiryDetail(inquiry) {
    return {
        inquiry_id: Number(inquiry.id),
        user_id: Number(inquiry.user_id),
        type: inquiry.type,
        title: inquiry.title,
        content: inquiry.content,
        status: inquiry.status,
        answer: inquiry.answer,
        answered_at: inquiry.answered_at,
        created_at: inquiry.created_at
    }
}

// DB row를 11.3 답변 등록 Response 200의 data 형태로 변환한다. (명세: inquiry_id, status, answered_at만 내려줌)
function toAnswerResult(inquiry) {
	return {
		inquiry_id: Number(inquiry.id),
		status: inquiry.status,
		answered_at: inquiry.answered_at,
	}
}

// 문의 관리: 회원 구분 없이 등록된 모든 문의를 최신순으로 반환한다.
// (일반 회원용 getInquiries는 "내 문의"만 봤지만, 관리자는 전체를 다 봐야 하므로
//  repository에 userId를 넘기지 않는 findAll을 따로 둔다)
export async function getInquiries() {
	const inquiries = await repository.findAllInquiries()
	return inquiries.map(toInquiryListItem)
}

export async function getInquiry(rawInquiryId) {
    const inquiryId = Number(rawInquiryId)

    if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
        throw serviceError("올바르지 않은 문의 번호입니다.", 400, "INVALID_INQUIRY_ID")
    }

    const inquiry = await repository.findInquiryById(inquiryId)

    if (!inquiry) {
        throw serviceError("문의를 찾을 수 없습니다.", 404, "INQUIRY_NOT_FOUND")
    }

    return toInquiryDetail(inquiry)
}

// 11.3 문의 답변 등록(관리자): 문의 1건에 답변을 등록하고 상태를 answered로 바꾼다.
// adminUserId: 답변을 등록하는 관리자 본인의 PK (누가 답변했는지 기록해 두기 위함)
// rawInquiryId: URL의 :inquiryId (문자열)
// rawAnswer: 요청 본문의 answer 값
export async function answerInquiry(adminUserId, rawInquiryId, rawAnswer) {
	// 1) URL 파라미터 검증 (inquiries.service.js의 getInquiry와 동일한 패턴)
	const inquiryId = Number(rawInquiryId)
	if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
		throw serviceError("올바르지 않은 문의 번호입니다.", 400, "INVALID_INQUIRY_ID")
	}

	// 2) 답변 내용 검증. answer는 스키마상 TEXT라 길이 제한은 없지만, 빈 값은 막는다.
	const answer = rawAnswer?.trim()
	if (!answer) {
		throw serviceError("답변 내용은 필수입니다.", 400, "MISSING_FIELD")
	}

	// 3) 답변하려는 문의가 실제로 존재하는지 먼저 확인한다.
	//    (없는 id를 UPDATE하면 아무 것도 안 바뀐 채 조용히 끝나버리므로, 미리 확인해서 404를 명확히 내려준다)
	const inquiry = await repository.findInquiryById(inquiryId)
	if (!inquiry) {
		throw serviceError("문의를 찾을 수 없습니다.", 404, "INQUIRY_NOT_FOUND")
	}

	if (inquiry.status === "answered") {
		throw serviceError("이미 답변이 등록된 문의입니다.", 409, "INQUIRY_ALREADY_ANSWERED")
	}

	// 4) answer 저장 + status를 'answered'로 변경 + answered_at을 지금 시각으로 기록.
	//    UPDATE 결과 row(갱신된 status/answered_at 포함)를 그대로 받아온다.
	const answered = await repository.answerInquiry(inquiryId, answer, adminUserId)

    if (!answered) {
        throw serviceError(
            "이미 답변이 등록된 문의입니다.",
            409,
            "INQUIRY_ALREADY_ANSWERED"
        )
    }

    return toAnswerResult(answered)
}



function toReportListItem(report) {
	return {
		report_id: Number(report.id),
		post_id: Number(report.post_id),
		post_type: report.post_type,
		user_id: Number(report.user_id),
		reason: report.reason,
		detail: report.detail,
		status: report.status,
		created_at: report.created_at,
		updated_at: report.updated_at
	}
}

// 신고 목록 조회
export async function getReports(query) {
	const status = query.status?.trim() || null

	if (status && !["pending", "resolved", "rejected"].includes(status)) {
		throw serviceError("status 값이 올바르지 않습니다.", 400, "INVALID_STATUS")
	}

	const reports = await repository.findAllReports(status)
	return reports.map(toReportListItem)
}

// 10.2 신고 처리
export async function updateReport(rawReportId, rawStatus) {
	const reportId = Number(rawReportId)

	if (!Number.isInteger(reportId) || reportId <= 0) {
		throw serviceError("올바르지 않은 신고 번호입니다.", 400, "INVALID_REPORT_ID")
	}

	const status = rawStatus?.trim()

	if (!["resolved", "rejected"].includes(status)) {
		throw serviceError(
			"status는 resolved 또는 rejected만 가능합니다.",
			400,
			"INVALID_STATUS"
		)
	}

	const report = await repository.findReportById(reportId)

	if (!report) {
		throw serviceError("신고를 찾을 수 없습니다.", 404, "REPORT_NOT_FOUND")
	}

	if (report.status !== "pending") {
		throw serviceError("이미 처리된 신고입니다.", 409, "REPORT_ALREADY_PROCESSED")
	}

	let updated

    // 승인 시 게시글 블라인드 + 신고 상태 변경 = 트랜잭션으로 처리
    if (status === "resolved") {
        try {
            updated = await repository.resolveReportWithBlind(
                reportId,
                report.post_type,
                report.post_id
            )
        } catch (error) {
            if (error.code === "POST_NOT_FOUND") {
                throw serviceError(
                    "신고 대상 게시글을 찾을 수 없습니다.",
                    404,
                    "POST_NOT_FOUND"
                )
            }

            if (error.code === "REPORT_ALREADY_PROCESSED") {
                throw serviceError(
                    "이미 처리된 신고입니다.",
                    409,
                    "REPORT_ALREADY_PROCESSED"
                )
            }

            throw error
        }
    } else {
        updated = await repository.updateReportStatus(reportId, status)

        if (!updated) {
            throw serviceError(
                "이미 처리된 신고입니다.",
                409,
                "REPORT_ALREADY_PROCESSED"
            )
        }
    }

	return {
		report_id: Number(updated.id),
		status: updated.status,
		updated_at: updated.updated_at
	}
}


function validatePostStatus(status) {
    if (status && !["active", "blind"].includes(status)) {
        throw serviceError("status 값이 올바르지 않습니다.", 400, "INVALID_STATUS")
    }
}

function toLostPostListItem(post) {
    return {
        id: Number(post.id),
        user_id: Number(post.user_id),
        pet_name: post.pet_name,
        species: post.species,
        breed: post.breed,
        region: post.region,
        event_date: post.event_date,
        status: post.status,
        primary_image_url: post.primary_image_url,
        created_at: post.created_at
    }
}

function toFoundPostListItem(post) {
    return {
        id: Number(post.id),
        user_id: Number(post.user_id),
        title: post.title,
        species: post.species,
        breed: post.breed,
        region: post.region,
        find_date: post.find_date,
        status: post.status,
        primary_image_url: post.primary_image_url,
        created_at: post.created_at
    }
}

export async function getLostPosts(query) {
    const status = query.status?.trim() || null

    validatePostStatus(status)

    const posts = await repository.findAllLostPosts(status)
    return posts.map(toLostPostListItem)
}

export async function getFoundPosts(query) {
    const status = query.status?.trim() || null

    validatePostStatus(status)

    const posts = await repository.findAllFoundPosts(status)
    return posts.map(toFoundPostListItem)
}


export async function getDashboard() {
    const stats = await repository.getDashboardStats()

    return {
        lost_posts: {
            total: Number(stats.lost_total),
            active: Number(stats.lost_active),
            blind: Number(stats.lost_blind)
        },
        found_posts: {
            total: Number(stats.found_total),
            active: Number(stats.found_active),
            blind: Number(stats.found_blind)
        },
        reports: {
            total: Number(stats.reports_total),
            pending: Number(stats.reports_pending),
            resolved: Number(stats.reports_resolved),
            rejected: Number(stats.reports_rejected)
        },
        inquiries: {
            total: Number(stats.inquiries_total),
            pending: Number(stats.inquiries_pending),
            answered: Number(stats.inquiries_answered)
        }
    }
}

// 관리자 매칭 기록 조회
const VALID_SOURCE_TYPES = ["rescue", "pawinhand"]

export async function getMatches(query) {
    const minSimilarity = query.min_similarity ? Number(query.min_similarity) : null
    const matchedDate = query.matched_date?.trim() || null
    const sourceType = query.source_type?.trim() || null
    const userSearch = query.user?.trim() || null
    const limit = query.limit ? Number(query.limit) : 100

    if (minSimilarity !== null && (Number.isNaN(minSimilarity) || minSimilarity < 0 || minSimilarity > 1)) {
        const error = new Error("min_similarity는 0~1 사이 값이어야 합니다.")
        error.status = 400
        error.code = "INVALID_QUERY"
        throw error
    }

    if (sourceType !== null && !VALID_SOURCE_TYPES.includes(sourceType)) {
        const error = new Error("source_type은 rescue 또는 pawinhand여야 합니다.")
        error.status = 400
        error.code = "INVALID_QUERY"
        throw error
    }

    const matches = await repository.findAllMatches({
        minSimilarity,
        matchedDate,
        sourceType,
        userSearch,
        limit
    })

    return groupByLostPost(matches.map(toMatchListItem))
}

function toMatchListItem(match) {
    return {
        id: Number(match.id),
        lost_post: {
            id: Number(match.source_post_id),
            pet_name: match.pet_name,
            species: match.lost_species,
            image_url: match.lost_image_url
        },
        user: {
            id: Number(match.user_id),
            name: match.user_name,
            email: match.user_email
        },
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

// 같은 실종 공고끼리 묶어서 반환한다 (관리자 화면에서 공고 단위로 펼쳐보기 위함).
function groupByLostPost(items) {
    const groups = new Map()

    for (const item of items) {
        const key = item.lost_post.id
        if (!groups.has(key)) {
            groups.set(key, {
                lost_post: item.lost_post,
                user: item.user,
                matches: []
            })
        }
        groups.get(key).matches.push({
            id: item.id,
            animal: item.animal,
            similarity_score: item.similarity_score,
            matched_date: item.matched_date,
            created_at: item.created_at
        })
    }

    return [...groups.values()]
}