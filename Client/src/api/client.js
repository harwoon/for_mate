// 백엔드와 통신하는 공통 함수.
// 개발 중에는 vite.config.js의 proxy가 4000 포트로 넘겨주므로 주소를 비워둔다.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || ""

async function request(path, options = {}) {
  const response = await fetch(BASE_URL + path, {
    // 로그인 쿠키(refresh_token)를 주고받으려면 반드시 필요하다.
    credentials: "include",
    ...options,
  })

  // 204는 본문이 없다 (로그아웃, 토큰 재발급 등)
  if (response.status === 204) return null

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    // 백엔드 공통 에러 형식: { success: false, error: { code, message } }
    const error = new Error(body?.error?.message || "요청에 실패했습니다.")
    error.status = response.status
    error.code = body?.error?.code
    throw error
  }

  // 백엔드 공통 성공 형식: { success: true, data: {...} }
  return body?.data
}

export function get(path) {
  return request(path)
}

export function post(path, data) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
}

export function put(path, data) {
  return request(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
}

export function patch(path, data) {
  return request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
}

export function del(path) {
  return request(path, { method: "DELETE" })
}

// 이미지 업로드용. FormData를 보낼 때는 Content-Type을 직접 넣으면 안 된다.
export function postForm(path, formData) {
  return request(path, { method: "POST", body: formData })
}

// 목록 조회용 쿼리스트링 생성 (값이 없는 항목은 제외)
export function toQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.append(key, value)
    }
  })
  const query = search.toString()
  return query ? `?${query}` : ""
}
