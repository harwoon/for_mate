import * as service from "./admin.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 관리자 대시보드 통계
export async function getDashboard(req, res, next) {
  try {
    // TODO: 전체 공고 수, 신규 등록 수, 신고 건수 등 집계
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 실종 공고 관리
export async function getLostPosts(req, res, next) {
  try {
    // TODO: 전체 실종 공고 목록 조회
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 발견제보 관리
export async function getFoundPosts(req, res, next) {
  try {
    // TODO: 전체 발견제보 목록 조회
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 신고 목록 조회
export async function getReports(req, res, next) {
  try {
    // TODO: 처리 상태별 신고 목록 조회
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 10.2 신고 처리
export async function updateReport(req, res, next) {
  try {
    // TODO: status를 resolved/rejected로 변경
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 문의 관리
// GET /admin/inquiries  (requireAuth 통과 필수 - TODO: 관리자 권한 확인 추가)
export async function getInquiries(req, res, next) {
  try {
    // 일반 회원용 getInquiries(inquiries.controller.js)는 "내 문의"만 보여줬지만,
    // 관리자용은 req.userId로 필터링하지 않고 전체 회원의 문의를 다 가져온다.
    // (그래서 인자 없이 service.getInquiries()를 호출한다)
    const inquiries = await service.getInquiries()

    // ok(): 200 + { success: true, data: inquiries }
    ok(res, inquiries)
  } catch (err) {
    next(err)
  }
}

// 11.3 문의 답변 등록(관리자)
// PATCH /admin/inquiries/:inquiryId  (requireAuth 통과 필수 - TODO: 관리자 권한 확인 추가)
export async function answerInquiry(req, res, next) {
  try {
    // req.userId: 답변을 등록하는 관리자 본인의 PK (누가 답변했는지 기록용)
    // req.params.inquiryId: URL 경로의 문의 번호 (예: "/admin/inquiries/501" -> "501")
    // req.body.answer: 요청 본문의 답변 내용 ({ "answer": "답변 내용입니다." })
    const result = await service.answerInquiry(req.userId, req.params.inquiryId, req.body.answer)

    // ok(): 200 + { success: true, data: { inquiry_id, status, answered_at } } (명세 Response 200과 동일)
    ok(res, result)
  } catch (err) {
    // 답변 누락 -> 400, 없는 문의 -> 404 등 서비스가 던진 에러를 공통 에러 핸들러로 전달
    next(err)
  }
}
