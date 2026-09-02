import express from "express"
import crypto from "node:crypto"
import { mkdirSync } from "node:fs"
import { unlink } from "node:fs/promises"
import path from "node:path"
import multer from "multer"
import { requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./lost-posts.controller.js"

const router = express.Router()

// app.js가 /uploads 경로를 정적 파일로 제공하므로 그 하위에 실종 공고 사진을 저장한다.
// 서버를 처음 실행했을 때 폴더가 없어도 자동으로 생성된다.
const LOST_IMAGE_DIRECTORY = path.resolve("uploads", "lost-posts")
mkdirSync(LOST_IMAGE_DIRECTORY, { recursive: true })

const IMAGE_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}

// 원본 파일명 대신 UUID를 사용해 한글·공백·중복 파일명 문제를 방지한다.
const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, LOST_IMAGE_DIRECTORY)
  },
  filename(req, file, callback) {
    callback(null, `${crypto.randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`)
  },
})

// 실종 공고는 이미지 파일만, 한 장당 10MB 이하, 최대 8장까지 받는다.
const uploadLost = multer({
  storage,
  limits: {
    files: 8,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter(req, file, callback) {
    if (!IMAGE_EXTENSIONS[file.mimetype]) {
      const error = new Error("JPG, PNG, WEBP 이미지만 등록할 수 있습니다.")
      error.code = "INVALID_IMAGE_TYPE"
      return callback(error)
    }
    return callback(null, true)
  },
}).array("images", 8)

// DB 검증이나 저장이 실패했을 때 로컬에 남은 파일을 정리한다.
async function removeUploadedFiles(files = []) {
  await Promise.allSettled(files.map((file) => unlink(file.path)))
}

// Multer로 파일을 로컬에 저장하고, repository가 DB에 저장할 URL을 만든다.
// 등록과 수정 요청에서 함께 사용하며, 수정 요청은 새 이미지가 없어도 통과한다.
function uploadLostImagesLocally(req, res, next) {
  uploadLost(req, res, async (error) => {
    if (!error) {
      // DB에는 운영체제의 실제 경로가 아닌 웹에서 접근할 수 있는 URL 경로를 저장한다.
      req.imageUrls = req.files.map((file) => `/uploads/lost-posts/${file.filename}`)
      return next()
    }

    // 일부 파일이 저장된 뒤 Multer 오류가 발생했다면 먼저 삭제한다.
    await removeUploadedFiles(req.files)

    if (error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT") {
      error.status = 400
      error.code = "TOO_MANY_IMAGES"
      error.message = "이미지는 최대 8장까지 등록할 수 있습니다."
    } else if (error.code === "LIMIT_FILE_SIZE") {
      error.status = 400
      error.code = "IMAGE_TOO_LARGE"
      error.message = "이미지는 한 장당 10MB 이하여야 합니다."
    } else if (error.code === "INVALID_IMAGE_TYPE") {
      error.status = 422
      error.code = "IMAGE_PROCESSING_FAILED"
    } else {
      error.status = 422
      error.code = "IMAGE_PROCESSING_FAILED"
      error.message = "이미지 처리에 실패했습니다."
    }

    return next(error)
  })
}

// controller/service/repository에서 오류가 발생하면 이번 요청에서 저장한 파일만 삭제한다.
async function cleanupLostImagesOnError(error, req, res, next) {
  await removeUploadedFiles(req.files)
  next(error)
}

// 실행 순서: 로그인 확인 → 이미지 업로드 → 요청 검증 및 DB 저장 → 201 응답
router.post(
  "/",
  requireAuth,
  uploadLostImagesLocally,
  controller.createPost,
  cleanupLostImagesOnError,
) // 3.1 실종 공고 등록
router.get("/", controller.getPosts)                                    // 3.2 실종 공고 목록 조회 (필터링)
router.get("/:id", controller.getPost)                                  // 3.3 실종 공고 상세 조회
router.put(
  "/:id",
  requireAuth,
  uploadLostImagesLocally,
  controller.updatePost,
  cleanupLostImagesOnError,
) // 3.4 실종 공고 및 이미지 수정
router.patch("/:id/status", requireAuth, controller.updateStatus)       // 3.4 상태 변경 (찾음 처리)
router.delete("/:id", requireAuth, controller.deletePost)               // 3.4 실종 공고 삭제

export default router
