import { Router } from "express"
import { optionalAuth, requireAuth } from "../../middleware/auth.middleware.js"
import * as controller from "./comments.controller.js"

const router = Router()

router.get("/:postType/:postId", optionalAuth, controller.getComments)
router.post("/:postType/:postId", requireAuth, controller.createComment)
router.patch("/:commentId", requireAuth, controller.updateComment)
router.delete("/:commentId", requireAuth, controller.deleteComment)

export default router
