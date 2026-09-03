import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./my.controller.js"

const router = express.Router()

// 8.1 마이페이지 요약 조회
router.get("/summary", requireAuth, controller.getSummary)

// 8.2 내 실종 공고 목록 조회
router.get("/lost-posts", requireAuth, controller.getMyLostPosts) 

// 8.3 내 발견제보 목록 조회
router.get("/found-posts", requireAuth, controller.getMyFoundPosts) 

export default router
