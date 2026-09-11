import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./notifications.controller.js"

const router = express.Router()

// 9.1 알림 목록 조회
router.get("/", requireAuth, controller.getNotifications) 

// 9.2 알림 읽음 처리
router.put("/:id/read", requireAuth, controller.readNotification)  

// 9.3 모든 알림 읽음 처리
router.put("/read-all", requireAuth, controller.readAllNotifications)

export default router