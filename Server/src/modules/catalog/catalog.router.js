import express from "express"
import * as controller from "./catalog.controller.js"

const router = express.Router()

router.get("/breeds", controller.getBreeds)         // 2.1 품종 목록 조회 (자동완성)
router.get("/color-tags", controller.getColorTags)  // 2.2 색상 태그 목록 조회
router.get("/regions", controller.getRegions)       // 2.3 지역 목록 조회

export default router
