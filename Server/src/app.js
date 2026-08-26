import express from "express"
import cors from "cors"

import authRouter from "./modules/auth/auth.router.js"
import catalogRouter from "./modules/catalog/catalog.router.js"
import lostPostsRouter from "./modules/lost-posts/lost-posts.router.js"
import foundPostsRouter from "./modules/found-posts/found-posts.router.js"
import rescueAnimalsRouter from "./modules/rescue-animals/rescue-animals.router.js"
import matchesRouter from "./modules/matches/matches.router.js"
import bookmarksRouter from "./modules/bookmarks/bookmarks.router.js"
import myRouter from "./modules/my/my.router.js"
import notificationsRouter from "./modules/notifications/notifications.router.js"
import reportsRouter from "./modules/reports/reports.router.js"
import inquiriesRouter from "./modules/inquiries/inquiries.router.js"
import pagesRouter from "./modules/pages/pages.router.js"
import adminRouter from "./modules/admin/admin.router.js"

import { errorHandler } from "./middleware/error.middleware.js"

const app = express()

app.use(cors())
app.use(express.json())
app.use("/uploads", express.static("uploads"))

// 서버 상태 확인용
app.get("/health", (req, res) => {
  res.json({ success: true, data: { status: "ok" } })
})

// API 명세서 장 번호와 같은 순서로 연결
app.use("/api/v1/auth", authRouter)              // 1. 인증
app.use("/api/v1", catalogRouter)                // 2. 공통 코드 (/breeds, /color-tags, /regions)
app.use("/api/v1/lost-posts", lostPostsRouter)   // 3. 실종 공고
app.use("/api/v1/found-posts", foundPostsRouter) // 4. 발견제보
app.use("/api/v1/rescue-animals", rescueAnimalsRouter) // 5. 구조동물 공고
app.use("/api/v1", matchesRouter)                // 6. AI 매칭
app.use("/api/v1/bookmarks", bookmarksRouter)    // 7. 북마크
app.use("/api/v1/my", myRouter)                  // 8. 마이페이지
app.use("/api/v1/notifications", notificationsRouter) // 9. 알림
app.use("/api/v1/reports", reportsRouter)        // 10. 신고
app.use("/api/v1/inquiries", inquiriesRouter)    // 11. 고객센터 문의
app.use("/api/v1/pages", pagesRouter)            // 12. 정적 페이지
app.use("/api/v1/admin", adminRouter)            // 관리자

// 없는 경로 처리
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "요청한 경로를 찾을 수 없습니다." }
  })
})

app.use(errorHandler)

export default app
