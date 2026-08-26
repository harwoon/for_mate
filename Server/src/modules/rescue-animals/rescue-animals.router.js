import express from "express"
import * as controller from "./rescue-animals.controller.js"

const router = express.Router()

router.get("/", controller.getAnimals)             // 5.1 구조동물 목록 조회 (필터링)
router.get("/:desertionNo", controller.getAnimal)  // 5.2 구조동물 상세 조회

export default router
