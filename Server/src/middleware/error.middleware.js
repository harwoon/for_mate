// 라우터에서 next(err)로 넘긴 에러를 공통 응답 형식으로 바꿔준다
export function errorHandler(err, req, res, next) {
  console.error(err)

  const status = err.status || 500
  const code =
    status >= 500
      ? "INTERNAL_ERROR"
      : err.code || "INTERNAL_ERROR"

  const message =
    status >= 500
      ? "서버 오류가 발생했습니다."
      : err.message || "요청 처리 중 오류가 발생했습니다."

  res.status(status).json({
    success: false,
    error: { code, message }
  })
}