import { get, post } from "./client.js"

// 백엔드: Server/src/modules/auth/auth.router.js
export const signup = (data) => post("/auth/signup", data)
export const login = (data) => post("/auth/login", data)
export const logout = () => post("/auth/logout")
export const getMe = () => get("/auth/me")
export const refresh = () => post("/auth/refresh")

// 소셜 로그인은 백엔드가 리다이렉트 방식으로 처리한다.
// 페이지 이동만 시키면 되고, 로그인이 끝나면 백엔드가 프론트로 다시 돌려보낸다.
export const goGoogleLogin = () => { window.location.href = "/auth/google" }
export const goKakaoLogin = () => { window.location.href = "/auth/kakao" }
