import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./matches.controller.js"

const router = express.Router()

router.get("/lost-posts/:id/matches", requireAuth, controller.getMatches)                                  // 6.1 AI 매칭 결과 조회
router.get("/matches/:matchId", requireAuth, controller.getMatchDetail)                                    // 6.2 매칭 상세 비교 조회

export default router
