import multer from "multer"
import path from "path"
import fs from "fs"
import { unlink } from "fs/promises"

// 발견제보 이미지 로컬 저장 폴더
export const foundUploadDir = path.join(
    process.cwd(),
    "uploads",
    "found-posts"
)

fs.mkdirSync(foundUploadDir, { recursive: true })

const IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, foundUploadDir)
    },

    filename: (req, file, cb) => {
        const ext = IMAGE_EXTENSIONS[file.mimetype]
        const filename = `${Date.now()}-${Math.round(Math.random() * 1000000)}${ext}`

        cb(null, filename)
    }
})

const uploadFound = multer({
    storage,
    limits: {
        files: 3,
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (!IMAGE_EXTENSIONS[file.mimetype]) {
            const error = new Error("JPG, PNG, WEBP 이미지만 등록할 수 있습니다.")
            error.code = "INVALID_IMAGE_TYPE"

            return cb(error)
        }

        cb(null, true)
    }
}).array("images", 3)

// 등록/수정 시 이미지 업로드
export function uploadFoundImages(req, res, next) {
    uploadFound(req, res, async (err) => {
        if (err) {
            await removeUploadedFoundFiles(req.files ?? [])

            // 최대 3장 초과 → API 명세 400
            if (
                err.code === "LIMIT_UNEXPECTED_FILE" ||
                err.code === "LIMIT_FILE_COUNT"
            ) {
                err.status = 400
                err.code = "TOO_MANY_IMAGES"
                err.message = "이미지는 최대 3장까지 등록할 수 있습니다."

                return next(err)
            }

            if (err.code === "LIMIT_FILE_SIZE") {
                err.status = 422
                err.code = "IMAGE_PROCESSING_FAILED"
                err.message = "이미지는 한 장당 최대 10MB까지 등록할 수 있습니다."

                return next(err)
            }

            if (err.code === "INVALID_IMAGE_TYPE") {
                err.status = 422
                err.code = "IMAGE_PROCESSING_FAILED"
                err.message = "JPG, JPEG, PNG, WEBP 이미지만 등록할 수 있습니다."

                return next(err)
            }

            // 그 외 이미지 처리 오류 → API 명세 422
            err.status = 422
            err.code = "IMAGE_PROCESSING_FAILED"
            err.message = "이미지 처리에 실패했습니다."

            return next(err)
        }

        req.imageUrls = (req.files ?? []).map(
            (file) => `/found-posts/images/${file.filename}`
        )

        next()
    })
}

// 요청 실패 시 이미 저장된 새 파일 정리
export async function removeUploadedFoundFiles(files = []) {
    await removeFiles(
        files
            .map((file) => file?.path)
            .filter(Boolean)
    )
}

// DB에서 삭제된 이미지의 실제 로컬 파일도 삭제
export async function removeFoundImageFiles(imageUrls = []) {
    const filePaths = imageUrls
        .filter((imageUrl) => (
            typeof imageUrl === "string" &&
            imageUrl.startsWith("/found-posts/images/")
        ))
        .map((imageUrl) => (
            path.join(foundUploadDir, path.basename(imageUrl))
        ))

    await removeFiles(filePaths)
}

async function removeFiles(filePaths) {
    const results = await Promise.allSettled(
        filePaths.map((filePath) => unlink(filePath))
    )

    results.forEach((result, index) => {
        if (
            result.status === "rejected" &&
            result.reason?.code !== "ENOENT"
        ) {
            console.error(
                `발견제보 이미지 파일 삭제 실패: ${filePaths[index]}`,
                result.reason
            )
        }
    })
}
