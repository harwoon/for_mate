// 공고 상태
export const POST_STATUS = {
  ACTIVE: "active",
  CLOSED: "closed"
}

// 신고 처리 상태
export const REPORT_STATUS = {
  PENDING: "pending",
  RESOLVED: "resolved",
  REJECTED: "rejected"
}

// 신고 사유
export const REPORT_REASONS = [
  "허위정보",
  "부적절한내용또는이미지",
  "광고홍보",
  "개인정보노출",
  "기타"
]

// 표준 색상 태그 (원본 색상을 LLM으로 정규화한 결과)
export const COLOR_TAGS = ["흰색", "검은색", "갈색", "황색", "회색", "크림색"]

// 이미지가 어느 공고에 속하는지 구분
export const POST_TYPE = {
  LOST: "lost",
  FOUND: "found",
  RESCUE: "rescue"
}
