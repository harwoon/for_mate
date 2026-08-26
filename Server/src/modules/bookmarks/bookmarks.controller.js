import * as service from "./bookmarks.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 7.1 북마크 등록
export async function addBookmark(req, res, next) {
  try {
    // TODO: desertion_no로 저장, 중복이면 409
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 7.2 북마크 목록 조회
export async function getBookmarks(req, res, next) {
  try {
    // TODO: 공고 기간 지났으면 is_expired true로 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 7.3 북마크 삭제
export async function removeBookmark(req, res, next) {
  try {
    // TODO: 본인 북마크인지 확인 후 삭제
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
