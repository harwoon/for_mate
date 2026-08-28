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

// TODO: 아래 컨트롤러에서 호출할 함수를 구현한다
// - getInquiry: 11.2 문의 상세 조회
