import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./notifications.controller.js"

const router = express.Router()

router.get("/", requireAuth, controller.getNotifications)          // 9.1 알림 목록 조회
router.put("/:id/read", requireAuth, controller.readNotification)  // 9.1 알림 읽음 처리

export default router
