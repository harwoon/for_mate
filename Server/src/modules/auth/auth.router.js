import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./auth.controller.js"

const router = express.Router()

router.post("/signup", controller.signup)                       // 1.1 회원가입
router.post("/login", controller.login)                         // 1.2 로그인
router.get("/me", requireAuth, controller.getMe)                // 1.3 내 정보 조회
router.post("/refresh", controller.refresh)                     // 1.4 토큰 재발급
router.post("/logout", controller.logout)                       // 1.5 로그아웃
router.post("/password/reset-request", controller.resetRequest) // 1.6 비밀번호 재설정 요청
router.post("/password/reset", controller.resetPassword)        // 1.6 비밀번호 재설정
router.get("/:provider/url", controller.getSocialUrl)           // 1.7 소셜 로그인 URL
router.post("/:provider/callback", controller.socialCallback)   // 1.8 소셜 로그인 콜백

export default router
