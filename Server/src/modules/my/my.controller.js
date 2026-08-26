import * as service from "./my.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 8.1 내 실종 신고 목록
export async function getMyLostPosts(req, res, next) {
  try {
    // TODO: 로그인한 사용자의 실종 공고 조회 (status 필터)
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 8.2 내 발견제보 목록
export async function getMyFoundPosts(req, res, next) {
  try {
    // TODO: 로그인한 사용자의 발견제보 조회
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
