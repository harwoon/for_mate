import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import { uploadLostImages } from "../../middleware/upload.middleware.js"
import * as controller from "./lost-posts.controller.js"

const router = express.Router()

router.post("/", requireAuth, uploadLostImages, controller.createPost)  // 3.1 실종 공고 등록 (사진 최대 8장)
router.get("/", controller.getPosts)                                    // 3.2 실종 공고 목록 조회 (필터링)
router.get("/:id", controller.getPost)                                  // 3.3 실종 공고 상세 조회
router.put("/:id", requireAuth, controller.updatePost)                  // 3.4 실종 공고 수정
router.patch("/:id/status", requireAuth, controller.updateStatus)       // 3.4 상태 변경 (찾음 처리)
router.delete("/:id", requireAuth, controller.deletePost)               // 3.4 실종 공고 삭제

export default router
