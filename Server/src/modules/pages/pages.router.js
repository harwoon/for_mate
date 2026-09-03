import express from "express"
import * as controller from "./pages.controller.js"

const router = express.Router()

// 12. 정적 페이지
// 셋 다 로그인 여부와 상관없이 누구나 볼 수 있어야 하는 페이지라(비회원도 회원가입 전에 약관을 봐야 한다)
// 인증 미들웨어를 붙이지 않았다.
router.get("/terms", controller.getTerms)      // 12. 이용약관
router.get("/privacy", controller.getPrivacy)  // 12. 개인정보처리방침
router.get("/about", controller.getAbout)      // 12. 서비스소개

export default router
