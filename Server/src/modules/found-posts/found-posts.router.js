import express from "express"
import { optionalAuth, requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./found-posts.controller.js"
import { uploadFoundImages,foundUploadDir,} from "./found-posts.upload.js"

const router = express.Router()

// 발견제보 이미지 조회
router.use("/images", express.static(foundUploadDir))

// 4.1 발견제보 등록 (사진 최대 3장)
router.post("/", requireAuth, uploadFoundImages, controller.createPost)

// 4.2 발견제보 목록 조회 (게시판)
router.get("/", controller.getPosts)

// 4.3 발견제보 상세 조회
router.get("/:id", optionalAuth, controller.getPost)

// 4.4 발견제보 수정
router.put("/:id", requireAuth, uploadFoundImages, controller.updatePost)

// 4.4 발견제보 삭제
router.delete("/:id", requireAuth, controller.deletePost)

export default router