import * as service from "./notifications.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 9.1 알림 목록 조회
export async function getNotifications(req, res, next) {
  try {
    // TODO: 로그인한 사용자의 알림 목록 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 9.1 알림 읽음 처리
export async function readNotification(req, res, next) {
  try {
    // TODO: is_read를 true로 변경
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
