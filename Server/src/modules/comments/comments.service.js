import * as repository from "./comments.repository.js"

const POST_TYPES = new Set(["lost", "found"])
const MAX_CONTENT_LENGTH = 1000

function serviceError(message, status, code) {
    return Object.assign(new Error(message), { status, code })
}

function parseId(value, label) {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) {
        throw serviceError(`${label}가 올바르지 않습니다.`, 400, "INVALID_ID")
    }
    return id
}

function parsePostType(value) {
    if (!POST_TYPES.has(value)) {
        throw serviceError("댓글을 지원하지 않는 게시글 종류입니다.", 400, "INVALID_POST_TYPE")
    }
    return value
}

function parseContent(value) {
    const content = typeof value === "string" ? value.trim() : ""
    if (!content) {
        throw serviceError("댓글 내용을 입력해주세요.", 400, "EMPTY_COMMENT")
    }
    if (content.length > MAX_CONTENT_LENGTH) {
        throw serviceError(`댓글은 ${MAX_CONTENT_LENGTH}자 이하로 입력해주세요.`, 400, "COMMENT_TOO_LONG")
    }
    return content
}

async function requirePost(postType, postId) {
    const post = await repository.findPost(postType, postId)
    if (!post) {
        throw serviceError("게시글을 찾을 수 없습니다.", 404, "POST_NOT_FOUND")
    }
    return post
}

function canViewSecret(row, post, viewer) {
    return !row.is_secret || (
        viewer.userId != null && (
            String(row.user_id) === String(viewer.userId) ||
            String(post.user_id) === String(viewer.userId)
        )
    )
}

function toItem(row, post, viewer) {
    const isDeleted = Boolean(row.deleted_at)
    const canView = canViewSecret(row, post, viewer)
    const isOwner = viewer.userId != null && String(row.user_id) === String(viewer.userId)

    return {
        id: Number(row.id),
        parent_id: row.parent_id == null ? null : Number(row.parent_id),
        author: {
            id: Number(row.user_id),
            name: row.author_name
        },
        content: isDeleted
            ? null
            : canView
                ? row.content
                : null,
        is_secret: Boolean(row.is_secret),
        is_hidden: !isDeleted && !canView,
        is_deleted: isDeleted,
        can_edit: isOwner && !isDeleted,
        can_delete: isOwner && !isDeleted,
        created_at: row.created_at,
        updated_at: row.updated_at
    }
}

export async function getComments({ postType: rawType, postId: rawId, userId }) {
    const postType = parsePostType(rawType)
    const postId = parseId(rawId, "게시글 ID")
    const post = await requirePost(postType, postId)
    const rows = await repository.findMany(postType, postId)
    const viewer = { userId }
    const items = rows.map((row) => ({ ...toItem(row, post, viewer), replies: [] }))
    const byId = new Map(items.map((item) => [item.id, item]))
    const roots = []

    for (const item of items) {
        if (item.parent_id && byId.has(item.parent_id)) {
            byId.get(item.parent_id).replies.push(item)
        } else {
            roots.push(item)
        }
    }

    return { items: roots, total: items.length }
}

export async function createComment({ postType: rawType, postId: rawId, userId, body }) {
    const postType = parsePostType(rawType)
    const postId = parseId(rawId, "게시글 ID")
    await requirePost(postType, postId)
    const parentId = body.parent_id == null ? null : parseId(body.parent_id, "부모 댓글 ID")

    if (parentId) {
        const parent = await repository.findById(parentId)
        if (!parent || parent.deleted_at || parent.parent_id != null ||
            parent.post_type !== postType || String(parent.post_id) !== String(postId)) {
            throw serviceError("답글을 작성할 댓글이 올바르지 않습니다.", 400, "INVALID_PARENT_COMMENT")
        }
    }

    const created = await repository.create({
        postType,
        postId,
        userId,
        parentId,
        content: parseContent(body.content),
        isSecret: Boolean(body.is_secret)
    })
    return { id: Number(created.id) }
}

export async function updateComment({ commentId: rawId, userId, body }) {
    const commentId = parseId(rawId, "댓글 ID")
    const comment = await repository.findById(commentId)
    if (!comment || comment.deleted_at) {
        throw serviceError("댓글을 찾을 수 없습니다.", 404, "COMMENT_NOT_FOUND")
    }
    if (String(comment.user_id) !== String(userId)) {
        throw serviceError("본인이 작성한 댓글만 수정할 수 있습니다.", 403, "FORBIDDEN")
    }
    await repository.update(commentId, parseContent(body.content), Boolean(body.is_secret))
    return { id: commentId }
}

export async function deleteComment({ commentId: rawId, userId }) {
    const commentId = parseId(rawId, "댓글 ID")
    const comment = await repository.findById(commentId)
    if (!comment || comment.deleted_at) {
        throw serviceError("댓글을 찾을 수 없습니다.", 404, "COMMENT_NOT_FOUND")
    }
    if (String(comment.user_id) !== String(userId)) {
        throw serviceError("본인이 작성한 댓글만 삭제할 수 있습니다.", 403, "FORBIDDEN")
    }
    await repository.softDelete(commentId)
    return { id: commentId }
}
