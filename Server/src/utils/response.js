// 성공 응답 형식 - API 명세서 공통 응답 구조와 동일하다
export function ok(res, data) {
  res.json({ success: true, data })
}

export function created(res, data) {
  res.status(201).json({ success: true, data })
}

// 실패 응답 형식
export function fail(res, status, code, message) {
  res.status(status).json({
    success: false,
    error: { code, message }
  })
}
