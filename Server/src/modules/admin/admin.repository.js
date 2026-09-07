import { query } from "../../db/pool.js"

// 사용 테이블: inquiries
// inquiries.repository.js의 INQUIRY_COLUMNS와 같은 패턴. (관리자 화면이라 answer/answered_at도 함께 조회)
const INQUIRY_COLUMNS = `id, user_id, type, title, content, status, answer, answered_at, created_at`

// 문의 관리: 회원 구분 없이 전체 문의를 최신순으로 조회한다.
// - inquiries.repository.js의 findManyByUserId()와 달리 WHERE 조건이 없다 -> 모든 회원의 문의가 다 나온다.
export async function findAllInquiries() {
	const result = await query(
		`SELECT ${INQUIRY_COLUMNS}
		FROM inquiries
		ORDER BY created_at DESC`,
	)
	return result.rows
}

// 문의 1건을 id로 조회한다. (답변 등록 전, 그 문의가 실제로 존재하는지 확인하는 용도)
// inquiries.repository.js의 findById()와 동일한 패턴.
export async function findInquiryById(inquiryId) {
	const result = await query(
		`SELECT ${INQUIRY_COLUMNS}
		FROM inquiries
		WHERE id = $1`,
		[inquiryId],
	)
	return result.rows[0] ?? null
}

// 11.3 문의 답변 등록: answer/status/answered_by/answered_at을 한 번에 갱신한다.
// - status를 'pending' -> 'answered'로 바꾸고, answered_at을 NOW()로 기록한다.
// - answered_by에는 "누가 답변했는지" 관리자의 PK를 남겨둔다. (명세 응답에는 안 나가지만 감사(audit) 목적으로 저장)
// - RETURNING으로 갱신된 행을 그대로 돌려받아서, service에서 별도 SELECT 없이 바로 응답을 만들 수 있게 한다.
export async function answerInquiry(inquiryId, answer, adminUserId) {
	const result = await query(
		`UPDATE inquiries
		SET answer = $1,
			status = 'answered',
			answered_by = $2,
			answered_at = NOW()
		WHERE id = $3
		RETURNING ${INQUIRY_COLUMNS}`,
		[answer, adminUserId, inquiryId],
	)
	return result.rows[0]
}




// 신고 관리: 전체 신고 목록 조회
export async function findAllReports(status) {
    const params = []
    let statusCondition = ""

    if (status) {
        params.push(status)
        statusCondition = "WHERE status = $1"
    }

    const result = await query(
        `SELECT
            id, post_id, post_type, user_id,
            reason, detail, status, created_at, updated_at
        FROM reports
        ${statusCondition}
        ORDER BY created_at DESC, id DESC`,
        params
    )

    return result.rows
}

// 신고 1건 조회
export async function findReportById(reportId) {
    const result = await query(
        `SELECT
            id, post_id, post_type, user_id,
            reason, detail, status, created_at, updated_at
        FROM reports
        WHERE id = $1`,
        [reportId]
    )

    return result.rows[0] ?? null
}

// 신고 상태 변경
export async function updateReportStatus(reportId, status) {
    const result = await query(
        `UPDATE reports
        SET status = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, post_id, post_type, status, updated_at`,
        [status, reportId]
    )

    return result.rows[0]
}

// 신고 대상 게시글 블라인드 처리
export async function blindPost(postType, postId) {
    const table = postType === "lost" ? "lost_posts" : "found_posts"

    const result = await query(
        `UPDATE ${table}
        SET status = 'blind'
        WHERE id = $1
        RETURNING id`,
        [postId]
    )

    return result.rows[0] ?? null
}