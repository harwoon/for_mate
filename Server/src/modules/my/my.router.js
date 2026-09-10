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

// 8.4 내 매칭 기록 목록 조회 (전체, ?lost_post_id=로 특정 공고만 필터 가능)
router.get("/matches", requireAuth, controller.getMyMatches)

export default router
