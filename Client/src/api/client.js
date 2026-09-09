// 백엔드와 통신하는 공통 함수.
// 개발 중에는 vite.config.js의 proxy가 4000 포트로 넘겨주므로 주소를 비워둔다.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "")
let refreshPromise = null
let authGeneration = 0
let refreshFailed = false

function expireSession(redirect) {
  window.dispatchEvent(new Event("auth:expired"))
  if (redirect && window.location.pathname !== "/login") window.location.assign("/login")
}

async function refreshSession() {
  if (refreshFailed) throw new Error("Session expired")
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(BASE_URL + "/auth/refresh", {
        method: "POST", credentials: "include",
      })
      if (!response.ok) throw new Error("Session expired")
      authGeneration += 1
    })().catch((error) => {
      refreshFailed = true
      throw error
    }).finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

async function request(path, options = {}, retried = false) {
  const generation = authGeneration
  const { redirectOnAuthFailure = true, ...fetchOptions } = options
  const response = await fetch(BASE_URL + path, {
    // 로그인 쿠키(refresh_token)를 주고받으려면 반드시 필요하다.
    credentials: "include",
    ...fetchOptions,
  })

  const authPath = path.split("?")[0].replace(/\/+$/, "")
  const skipRefresh = ["/auth/login", "/auth/signup", "/auth/refresh"].includes(authPath)
  if (response.status === 401 && !skipRefresh) {
    if (!retried) {
      try {
        // Late responses can reuse the refresh completed by another request.
        if (generation === authGeneration) await refreshSession()
      } catch {
        expireSession(redirectOnAuthFailure)
        throw Object.assign(new Error("로그인이 필요합니다."), { status: 401, code: "UNAUTHORIZED" })
      }
      return request(path, options, true)
    }
    expireSession(redirectOnAuthFailure)
  }

  if (response.ok && ["/auth/login", "/auth/signup", "/auth/refresh"].includes(authPath)) {
    refreshFailed = false
    authGeneration += 1
  }

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

export function get(path, options) {
  return request(path, options)
}

export function post(path, data) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
}

export function put(path, data) {
  if (data instanceof FormData) return putForm(path, data)
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

export function putForm(path, formData) {
  return request(path, { method: "PUT", body: formData })
}

export function imageUrl(value) {
  if (!value) return value
  if (/^https?:\/\//i.test(value)) return value
  return `${BASE_URL}/${value.replace(/^\/+/, "")}`
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
