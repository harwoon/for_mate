import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import { loginLimiter, signupLimiter } from "../../middleware/rateLimit.js"
import * as authController from "./auth.controller.js"

const router = express.Router()

router.post("/signup", signupLimiter, authController.signup)
router.post("/login", loginLimiter, authController.login)
router.get("/google", authController.startGoogleLogin)
router.get("/google/callback", authController.googleCallback)
router.get("/kakao", authController.startKakaoLogin)
router.get("/kakao/callback", authController.kakaoCallback)
router.get("/me", requireAuth, authController.getMe)
router.post("/refresh", authController.refresh)
router.post("/logout", authController.logout)

export default router