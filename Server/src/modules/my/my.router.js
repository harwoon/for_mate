import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./my.controller.js"

const router = express.Router()

router.get("/lost-posts", requireAuth, controller.getMyLostPosts)    // 8.1 내 실종 신고 목록
router.get("/found-posts", requireAuth, controller.getMyFoundPosts)  // 8.2 내 발견제보 목록

export default router
