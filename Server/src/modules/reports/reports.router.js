import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./reports.controller.js"

const router = express.Router()

router.post("/", requireAuth, controller.createReport)  // 10.1 게시글 신고

export default router
