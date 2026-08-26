import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./bookmarks.controller.js"

const router = express.Router()

router.post("/", requireAuth, controller.addBookmark)                  // 7.1 북마크 등록
router.get("/", requireAuth, controller.getBookmarks)                  // 7.2 북마크 목록 조회
router.delete("/:bookmarkId", requireAuth, controller.removeBookmark)  // 7.3 북마크 삭제

export default router
