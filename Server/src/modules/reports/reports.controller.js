import * as service from "./reports.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 10.1 게시글 신고
export async function createReport(req, res, next) {
  try {
    // TODO: 신고 사유 검증 후 저장, 같은 글 중복 신고면 409
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
