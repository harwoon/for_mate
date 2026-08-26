import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./inquiries.controller.js"

const router = express.Router()

router.post("/", requireAuth, controller.createInquiry)        // 11.1 문의 등록
router.get("/", requireAuth, controller.getInquiries)          // 11.2 내 문의 목록 조회
router.get("/:inquiryId", requireAuth, controller.getInquiry)  // 11.2 문의 상세 조회

export default router
