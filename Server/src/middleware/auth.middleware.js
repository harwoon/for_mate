import jwt from "jsonwebtoken"

// 로그인이 필요한 API에 사용한다. 통과하면 req.user에 사용자 정보가 담긴다.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." }
    })
  }

  const token = header.split(" ")[1]

  try {
    req.user = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
    next()
  } catch (err) {
    res.status(401).json({
      success: false,
      error: { code: "INVALID_TOKEN", message: "토큰이 만료되었거나 올바르지 않습니다." }
    })
  }
}
