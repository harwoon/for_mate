import * as service from "./inquiries.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 11.1 문의 등록
export async function createInquiry(req, res, next) {
  try {
    // TODO: 로그인한 사용자의 문의 저장
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 11.2 내 문의 목록 조회
export async function getInquiries(req, res, next) {
  try {
    // TODO: 본인 문의 목록 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 11.2 문의 상세 조회
export async function getInquiry(req, res, next) {
  try {
    // TODO: 문의 내용과 답변 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
