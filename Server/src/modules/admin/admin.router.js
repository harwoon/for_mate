import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import { requireAdmin } from "../../middleware/requireAdmin.js"
import * as controller from "./admin.controller.js"

const router = express.Router()

router.get("/dashboard", requireAuth, requireAdmin, controller.getDashboard)            // 관리자 대시보드 통계
router.get("/lost-posts", requireAuth, requireAdmin, controller.getLostPosts)           // 실종 공고 관리
router.get("/found-posts", requireAuth, requireAdmin, controller.getFoundPosts)         // 발견제보 관리
router.get("/reports", requireAuth, requireAdmin, controller.getReports)                // 신고 목록 조회
router.patch("/reports/:reportId", requireAuth, requireAdmin, controller.updateReport)  // 10.2 신고 처리
router.get("/inquiries", requireAuth, requireAdmin, controller.getInquiries)              // 문의 관리
router.patch("/inquiries/:inquiryId", requireAuth, requireAdmin, controller.answerInquiry) // 11.3 문의 답변 등록(관리자)

export default router
