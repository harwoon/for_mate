import { fail } from "../utils/response.js"

export function requireAdmin(req, res, next) {
  if (req.user?.is_admin !== true) {
    return fail(res, 403, "FORBIDDEN", "관리자 권한이 필요합니다.")
  }
  return next()
}