import multer from "multer"
import sharp from "sharp"
import { uploadToR2, deleteFromR2, extractR2Key } from "../../utils/r2.js"

const IMAGE_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}

const uploadFound = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 3,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_EXTENSIONS[file.mimetype]) {
      const error = new Error("JPG, PNG, WEBP 이미지만 등록할 수 있습니다.")
      error.code = "INVALID_IMAGE_TYPE"
      return cb(error)
    }
    cb(null, true)
  },
}).array("images", 3)

export function uploadFoundImages(req, res, next) {
  uploadFound(req, res, async (err) => {
    if (err) {
      if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
        err.status = 400
        err.code = "TOO_MANY_IMAGES"
        err.message = "이미지는 최대 3장까지 등록할 수 있습니다."
      } else if (err.code === "LIMIT_FILE_SIZE") {
        err.status = 422
        err.code = "IMAGE_PROCESSING_FAILED"
        err.message = "이미지는 한 장당 최대 10MB까지 등록할 수 있습니다."
      } else if (err.code === "INVALID_IMAGE_TYPE") {
        err.status = 422
        err.code = "IMAGE_PROCESSING_FAILED"
        err.message = "JPG, JPEG, PNG, WEBP 이미지만 등록할 수 있습니다."
      } else {
        err.status = 422
        err.code = "IMAGE_PROCESSING_FAILED"
        err.message = "이미지 처리에 실패했습니다."
      }
      return next(err)
    }

    try {
      const uploaded = await Promise.all(
        (req.files ?? []).map(async (file) => {
          const compressed = await sharp(file.buffer)
            .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer()
          return uploadToR2(compressed, "found-posts")
        }),
      )
      req.imageUrls = uploaded.map((u) => u.url)
      req.uploadedKeys = uploaded.map((u) => u.key)
      next()
    } catch (uploadError) {
      uploadError.status = 422
      uploadError.code = "IMAGE_PROCESSING_FAILED"
      uploadError.message = "이미지 업로드에 실패했습니다."
      next(uploadError)
    }
  })
}

// 요청 실패 시 이미 R2에 올린 파일 정리 (함수명 유지 — 다른 파일에서 그대로 import 중)
export async function removeUploadedFoundFiles(req = {}) {
  await Promise.allSettled((req.uploadedKeys ?? []).map((key) => deleteFromR2(key)))
}

// DB에서 삭제된 이미지의 R2 파일도 삭제 (함수명 유지)
export async function removeFoundImageFiles(imageUrls = []) {
  const keys = imageUrls.map(extractR2Key).filter(Boolean)
  await Promise.allSettled(keys.map((key) => deleteFromR2(key)))
}