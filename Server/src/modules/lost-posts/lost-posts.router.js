import express from "express"
import multer from "multer"
import { requireAuth, optionalAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./lost-posts.controller.js"
import sharp from "sharp"
import { uploadToR2, deleteFromR2 } from "../../utils/r2.js"

const router = express.Router()

const IMAGE_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}

const uploadLost = multer({
  storage: multer.memoryStorage(), // 디스크 대신 메모리에만 잠깐 들고 있다가 바로 R2로 올림
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

// 실패 시 이미 R2에 올라간 파일들을 되돌린다.
async function removeUploadedFiles(keys = []) {
  await Promise.allSettled(keys.map((key) => deleteFromR2(key)))
}

function uploadLostImagesLocally(req, res, next) {
  uploadLost(req, res, async (error) => {
    if (error) {
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
    }

    try {
      const uploaded = await Promise.all(
        (req.files || []).map(async (file) => {
          const compressed = await sharp(file.buffer)
            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer()
          return uploadToR2(compressed, "lost-posts")
        }),
      )
      req.imageUrls = uploaded.map((u) => u.url)
      req.uploadedKeys = uploaded.map((u) => u.key) // 실패 시 롤백용으로 보관
      return next()
    } catch (uploadError) {
      uploadError.status = 422
      uploadError.code = "IMAGE_PROCESSING_FAILED"
      uploadError.message = "이미지 업로드에 실패했습니다."
      return next(uploadError)
    }
  })
}

// DB 검증/저장 실패 시, 이번 요청에서 R2에 올린 파일만 정리한다.
async function cleanupLostImagesOnError(error, req, res, next) {
  await removeUploadedFiles(req.uploadedKeys)
  next(error)
}


// 3.1 실종 공고 등록
router.post(
  "/",
  requireAuth,
  uploadLostImagesLocally,
  controller.createPost,
  cleanupLostImagesOnError,
)

// 3.2 실종 공고 목록 조회 (필터링)
router.get("/", controller.getPosts)

// 3.3 실종 공고 상세 조회
router.get("/:id", optionalAuth, controller.getPost)

// 3.4 실종 공고 및 이미지 수정
router.put(
  "/:id",
  requireAuth,
  uploadLostImagesLocally,
  controller.updatePost,
  cleanupLostImagesOnError,
)

// 3.5 실종 공고 삭제
router.delete("/:id", requireAuth, controller.deletePost)

export default router
