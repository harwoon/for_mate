import { BASE_URL, get, post } from "./client.js"

// 백엔드: Server/src/modules/auth/auth.router.js
export const signup = (data) => post("/auth/signup", data)
export const login = (data) => post("/auth/login", data)
export const logout = () => post("/auth/logout")
export const getMe = (options) => get("/auth/me", options)
export const refresh = () => post("/auth/refresh")

// 소셜 로그인은 백엔드가 리다이렉트 방식으로 처리한다.
// 페이지 이동만 시키면 되고, 로그인이 끝나면 백엔드가 프론트로 다시 돌려보낸다.
// 상대 경로("/auth/google")로 두면 개발 서버(5173)로 가서 404가 나므로 다른 API 호출처럼 BASE_URL을 붙인다.
export const goGoogleLogin = () => { window.location.href = `${BASE_URL}/auth/google` }
export const goKakaoLogin = () => { window.location.href = `${BASE_URL}/auth/kakao` }
