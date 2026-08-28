import * as repository from "./inquiries.repository.js"

// DB 컬럼 길이 제한값. DB에서 자르기 에러(22001)가 나기 전에 서비스에서 400으로 먼저 막는다.
const TITLE_MAX_LENGTH = 200 // inquiries.title VARCHAR(200)
const TYPE_MAX_LENGTH = 30   // inquiries.type  VARCHAR(30)

// 상태 코드(status)와 에러 코드(code)를 담은 Error를 만든다.
// 라우터에서 next(err)로 넘기면 error.middleware.js가 이 값들을 읽어
// { success: false, error: { code, message } } 형태로 응답해 준다.
// auth.service.js의 동일 헬퍼와 같은 패턴.
function serviceError(message, status, code) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

// DB row(snake_case)를 명세서 11.1의 Response 201 data 형태로 변환한다.
// - content는 명세 응답에 없으므로 일부러 제외한다.
// - id/user_id는 BIGSERIAL이라 pg가 문자열("501")로 돌려주므로 Number()로 숫자(501)로 맞춘다.
function toInquirySummary(inquiry) {
  return {
    inquiry_id: Number(inquiry.id),   // 명세: id -> inquiry_id 로 키 이름이 바뀐다
    user_id: Number(inquiry.user_id),
    type: inquiry.type,
    title: inquiry.title,
    status: inquiry.status,           // DB DEFAULT 'pending' 값이 그대로 내려온다
    created_at: inquiry.created_at,
  }
}

// 11.1 문의 등록: 로그인 사용자의 문의를 검증 후 저장하고, 명세 응답 형태로 돌려준다.
export async function createInquiry(userId, { type: rawType, title: rawTitle, content: rawContent }) {
  // 앞뒤 공백 제거. type은 스키마상 NULL 허용이므로 빈 값이면 null로 저장한다.
  const type = rawType?.trim() || null
  const title = rawTitle?.trim()
  const content = rawContent?.trim()

  // title, content는 스키마상 NOT NULL -> 없으면 400으로 막는다.
  if (!title || !content) {
    throw serviceError("제목과 내용은 필수입니다.", 400, "MISSING_FIELD")
  }
  // 길이 초과는 DB 에러 대신 사용자 친화적인 400으로 반환한다.
  if (title.length > TITLE_MAX_LENGTH) {
    throw serviceError(`제목은 ${TITLE_MAX_LENGTH}자 이하로 입력해주세요.`, 400, "INVALID_TITLE")
  }
  if (type && type.length > TYPE_MAX_LENGTH) {
    throw serviceError(`문의 유형은 ${TYPE_MAX_LENGTH}자 이하로 입력해주세요.`, 400, "INVALID_TYPE")
  }

  // status, created_at은 DB 기본값에 맡기고, INSERT 결과 row를 그대로 받아온다.
  const inquiry = await repository.create({ userId, type, title, content })
  return toInquirySummary(inquiry)
}

// 11.2 내 문의 목록 조회: 로그인 사용자가 등록한 문의들을 최신순으로 반환한다.
// 컨트롤러는 req.userId만 넘겨주고, "누구 문의를 어떻게 가져올지"는 여기(서비스)와
// repository가 담당한다. -> 역할 분리(컨트롤러: HTTP, 서비스: 비즈니스 로직, 레포지토리: DB)
export async function getInquiries(userId) {
  // 1) DB에서 내 문의 row들을 가져온다. (snake_case, id/user_id는 문자열 형태)
  const inquiries = await repository.findManyByUserId(userId)

  // 2) 각 row를 11.1과 동일한 응답 형태(inquiry_id, camelCase 등)로 변환한다.
  //    createInquiry에서 이미 만들어 둔 toInquirySummary()를 그대로 재사용한다.
  //    (같은 변환 로직을 두 곳에 중복 작성하지 않기 위함)
  return inquiries.map(toInquirySummary)
}

// DB row(snake_case)를 명세서 11.2 상세 조회 Response의 data 형태로 변환한다.
// - toInquirySummary()와 다르게 content(문의 내용), answer(답변 내용), answered_at(답변 시각)까지 포함한다.
//   (목록에서는 굳이 다 안 보여줘도 되지만, 상세 화면에서는 사용자가 본문/답변을 읽어야 하기 때문)
// - 아직 답변 전이면 DB의 answer/answered_at 컬럼이 NULL이고,
//   그 NULL이 그대로 JSON의 null로 내려간다. (명세서 안내와 동일: "답변 전에는 answer, answered_at이 null로 응답된다")
function toInquiryDetail(inquiry) {
  return {
    inquiry_id: Number(inquiry.id),
    type: inquiry.type,
    title: inquiry.title,
    content: inquiry.content,
    status: inquiry.status,       // "pending"(답변 대기) | "answered"(답변 완료)
    answer: inquiry.answer,       // 답변 전이면 null
    answered_at: inquiry.answered_at, // 답변 전이면 null
    created_at: inquiry.created_at,
  }
}

// 11.2 문의 상세 조회: 문의 1건의 내용과 답변을 반환한다.
// userId: requireAuth가 확인해 준 "지금 로그인한 사람"의 PK
// rawInquiryId: 라우터의 :inquiryId 부분 (예: /inquiries/501 -> "501", 문자열로 들어온다)
export async function getInquiry(userId, rawInquiryId) {
  // URL 파라미터는 항상 문자열이므로 숫자로 바꿔준다.
  // "501" -> 501은 되지만, "abc" -> NaN, "1.5" -> 정수가 아님 이므로 함께 걸러낸다.
  const inquiryId = Number(rawInquiryId)
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
    throw serviceError("올바르지 않은 문의 번호입니다.", 400, "INVALID_INQUIRY_ID")
  }

  // 1) DB에서 해당 id의 문의를 찾는다.
  const inquiry = await repository.findById(inquiryId)

  // 2) 그런 문의 자체가 없는 경우 -> 404 Not Found
  if (!inquiry) {
    throw serviceError("문의를 찾을 수 없습니다.", 404, "INQUIRY_NOT_FOUND")
  }

  // 3) 문의는 존재하지만, 로그인한 사용자가 등록한 문의가 아닌 경우 -> 403 Forbidden
  //    (남의 문의 내용/답변을 아무나 볼 수 있으면 안 되므로 반드시 작성자 본인인지 확인한다)
  //
  //    주의: pg 드라이버는 BIGINT/BIGSERIAL 컬럼(users.id, inquiries.user_id)을
  //    정밀도 손실을 막기 위해 "숫자"가 아니라 "문자열"로 돌려준다.
  //    그래서 auth.middleware.js가 넣어주는 req.userId도 실제로는 "3" 같은 문자열이다.
  //    inquiry.user_id만 Number()로 바꾸고 userId는 그대로 두면
  //    3 !== "3" (숫자 vs 문자열) 이 되어 본인 문의인데도 항상 다르다고 판단해버린다.
  //    -> 양쪽 다 Number()로 바꿔서 "값"만 비교하도록 맞춰준다.
  if (Number(inquiry.user_id) !== Number(userId)) {
    throw serviceError("본인이 등록한 문의만 조회할 수 있습니다.", 403, "INQUIRY_FORBIDDEN")
  }

  // 4) 통과했으면 명세서 형태로 변환해서 반환한다.
  return toInquiryDetail(inquiry)
}
