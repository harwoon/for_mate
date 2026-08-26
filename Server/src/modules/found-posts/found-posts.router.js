import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import { uploadFoundImages } from "../../middleware/upload.middleware.js"
import * as controller from "./found-posts.controller.js"

const router = express.Router()

router.post("/", requireAuth, uploadFoundImages, controller.createPost)  // 4.1 발견제보 등록 (사진 최대 3장)
router.get("/", controller.getPosts)                                     // 4.2 발견제보 목록 조회 (게시판)
router.get("/:id", controller.getPost)                                   // 4.3 발견제보 상세 조회
router.put("/:id", requireAuth, controller.updatePost)                   // 4.4 발견제보 수정
router.delete("/:id", requireAuth, controller.deletePost)                // 4.4 발견제보 삭제

export default router
