import express from "express"
import * as controller from "./pages.controller.js"

const router = express.Router()

router.get("/terms", controller.getTerms)      // 12. 이용약관
router.get("/privacy", controller.getPrivacy)  // 12. 개인정보처리방침
router.get("/about", controller.getAbout)      // 12. 서비스소개

export default router
