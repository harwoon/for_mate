import express from "express"
import { requireAuth } from "../../middleware/auth.middleware.js"
import { uploadLostImages } from "../../middleware/upload.middleware.js"
import * as controller from "./lost-posts.controller.js"

const router = express.Router()

// 공용 업로드 미들웨어는 오류에 HTTP 상태를 지정하지 않으므로,
// 실종 공고 API 명세에 맞게 이 라우터 안에서만 400/422 오류로 변환한다.
function uploadLostImagesForCreate(req, res, next) {
  // uploadLostImages는 images 필드의 파일을 메모리로 받은 뒤 Supabase에 올리고,
  // 성공하면 URL 배열을 req.imageUrls에 저장한다.
  uploadLostImages(req, res, (error) => {
    // 업로드가 성공했으면 다음 단계인 controller.createPost로 이동한다.
    if (!error) return next()

    // multer는 허용 개수(8장)를 넘기면 LIMIT_UNEXPECTED_FILE 오류를 전달한다.
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      error.status = 400
      error.code = "TOO_MANY_IMAGES"
      error.message = "이미지는 최대 8장까지 등록할 수 있습니다."
    } else {
      // 그 밖의 오류는 Supabase 업로드 등 이미지 처리 실패로 분류한다.
      error.status = 422
      error.code = "IMAGE_PROCESSING_FAILED"
      error.message = "이미지 처리에 실패했습니다."
    }

    // 상태와 코드가 지정된 오류를 공통 error.middleware로 보낸다.
    return next(error)
  })
}

// TODO(업로드 정리): Supabase 업로드 후 DB 저장이 실패했을 때 파일을 삭제하려면
// 공용 upload.middleware.js가 저장 경로 또는 삭제 함수를 제공하도록 팀 협의가 필요하다.
// 실행 순서: 로그인 확인 → 이미지 업로드 → 요청 검증 및 DB 저장 → 201 응답
router.post("/", requireAuth, uploadLostImagesForCreate, controller.createPost) // 3.1 실종 공고 등록
router.get("/", controller.getPosts)                                    // 3.2 실종 공고 목록 조회 (필터링)
router.get("/:id", controller.getPost)                                  // 3.3 실종 공고 상세 조회
router.put("/:id", requireAuth, controller.updatePost)                  // 3.4 실종 공고 수정
router.patch("/:id/status", requireAuth, controller.updateStatus)       // 3.4 상태 변경 (찾음 처리)
router.delete("/:id", requireAuth, controller.deletePost)               // 3.4 실종 공고 삭제

export default router
