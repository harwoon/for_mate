import * as authRepository from "../modules/auth/auth.repository.js"
import { getCookie } from "../utils/cookie.js"
import { verifyAccessToken } from "../utils/jwt.js"

const AUTH_ERROR = { success: false, error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } }

export async function requireAuth(req, res, next) {
  const authHeader = req.get("Authorization")
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined
  const token = bearerToken || getCookie(req, "access_token")

  if (!token) return res.status(401).json(AUTH_ERROR)

  try {
    const decoded = verifyAccessToken(token)
    const user = await authRepository.findById(decoded.userId)
    if (!user) return res.status(401).json(AUTH_ERROR)
    req.userId = user.id
    req.user = user
    return next()
  } catch {
    return res.status(401).json(AUTH_ERROR)
  }
}

// 선택적 인증 추가
// 비회원 요청 허용, 로그인 사용자 정보 req에 저장
export async function optionalAuth(req, res, next) {
  const authHeader = req.get("Authorization")
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined
  const token = bearerToken || getCookie(req, "access_token")

  if (!token) return next()

  try {
    const decoded = verifyAccessToken(token)
    const user = await authRepository.findById(decoded.userId)
    if (!user) return next()
    req.userId = user.id
    req.user = user
  } catch {
    // 토큰이 만료되거나 유효하지 않아도 공개 API -> 요청 계속 진행
  }

  return next()
}
