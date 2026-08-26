import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./matches.controller.js"

const router = express.Router()

router.get("/lost-posts/:id/matches", requireAuth, controller.getMatches)                                  // 6.1 AI 매칭 결과 조회
router.get("/matches/:matchId", requireAuth, controller.getMatchDetail)                                    // 6.2 매칭 상세 비교 조회
router.post("/lost-posts/:id/matches/refresh", requireAuth, controller.refreshMatches)                     // 6.3 매칭 재계산 요청
router.post("/lost-posts/:id/matches/exclusions", requireAuth, controller.addExclusion)                    // 6.4 매칭 후보 제외
router.get("/lost-posts/:id/matches/exclusions", requireAuth, controller.getExclusions)                    // 6.5 제외 목록 조회
router.delete("/lost-posts/:id/matches/exclusions/:exclusionId", requireAuth, controller.removeExclusion)  // 6.5 제외 해제

export default router
