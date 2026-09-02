import * as repository from "./admin.repository.js"

// TODO: 관리자 권한 확인 미들웨어(requireAdmin)를 추가해야 한다

// TODO: 아래 컨트롤러에서 호출할 함수들은 아직 구현 전이다 (컨트롤러에서 바로 501 응답 중)
// - getDashboard: 관리자 대시보드 통계
// - getLostPosts: 실종 공고 관리
// - getFoundPosts: 발견제보 관리
// - getReports: 신고 목록 조회
// - updateReport: 10.2 신고 처리

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
    created_at: inquiry.created_at,
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

  // 4) answer 저장 + status를 'answered'로 변경 + answered_at을 지금 시각으로 기록.
  //    UPDATE 결과 row(갱신된 status/answered_at 포함)를 그대로 받아온다.
  const answered = await repository.answerInquiry(inquiryId, answer, adminUserId)
  return toAnswerResult(answered)
}
