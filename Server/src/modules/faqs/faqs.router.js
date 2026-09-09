import { Router } from "express"
import { getFaqs } from "./faqs.controller.js"

const router = Router()
router.get("/", getFaqs)
export default router
