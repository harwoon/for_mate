import { created, ok } from "../../utils/response.js"
import * as service from "./comments.service.js"

export async function getComments(req, res, next) {
    try {
        ok(res, await service.getComments({
            postType: req.params.postType,
            postId: req.params.postId,
            userId: req.userId,
            isAdmin: req.user?.is_admin
        }))
    } catch (error) {
        next(error)
    }
}

export async function createComment(req, res, next) {
    try {
        created(res, await service.createComment({
            postType: req.params.postType,
            postId: req.params.postId,
            userId: req.userId,
            body: req.body ?? {}
        }))
    } catch (error) {
        next(error)
    }
}

export async function updateComment(req, res, next) {
    try {
        ok(res, await service.updateComment({
            commentId: req.params.commentId,
            userId: req.userId,
            body: req.body ?? {}
        }))
    } catch (error) {
        next(error)
    }
}

export async function deleteComment(req, res, next) {
    try {
        ok(res, await service.deleteComment({
            commentId: req.params.commentId,
            userId: req.userId
        }))
    } catch (error) {
        next(error)
    }
}
