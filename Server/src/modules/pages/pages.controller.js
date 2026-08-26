import * as service from "./pages.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 12. 이용약관
export async function getTerms(req, res, next) {
  try {
    // TODO: 약관 내용 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 12. 개인정보처리방침
export async function getPrivacy(req, res, next) {
  try {
    // TODO: 처리방침 내용 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 12. 서비스소개
export async function getAbout(req, res, next) {
  try {
    // TODO: 서비스 소개 내용 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
