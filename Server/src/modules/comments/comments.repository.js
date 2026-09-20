import { query } from "../../db/pool.js"

const POST_TABLES = {
    lost: "lost_posts",
    found: "found_posts"
}

export async function findPost(postType, postId) {
    const table = POST_TABLES[postType]
    const { rows } = await query(
        `SELECT id, user_id, status FROM ${table} WHERE id = $1`,
        [postId]
    )
    return rows[0] ?? null
}

export async function findMany(postType, postId) {
    const { rows } = await query(
        `
        SELECT
            c.id,
            c.post_type,
            c.post_id,
            c.user_id,
            c.parent_id,
            c.content,
            c.is_secret,
            c.created_at,
            c.updated_at,
            c.deleted_at,
            u.name AS author_name
        FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.post_type = $1
          AND c.post_id = $2
        ORDER BY c.created_at ASC, c.id ASC
        `,
        [postType, postId]
    )
    return rows
}

export async function findById(commentId) {
    const { rows } = await query(
        `
        SELECT c.*, u.name AS author_name
        FROM comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.id = $1
        `,
        [commentId]
    )
    return rows[0] ?? null
}

export async function create({ postType, postId, userId, parentId, content, isSecret }) {
    const { rows } = await query(
        `
        INSERT INTO comments (
            post_type, post_id, user_id, parent_id, content, is_secret
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [postType, postId, userId, parentId, content, isSecret]
    )
    return rows[0]
}

export async function update(commentId, content, isSecret) {
    const { rows } = await query(
        `
        UPDATE comments
        SET content = $2,
            is_secret = $3,
            updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING *
        `,
        [commentId, content, isSecret]
    )
    return rows[0] ?? null
}

export async function softDelete(commentId) {
    const { rows } = await query(
        `
        UPDATE comments
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id
        `,
        [commentId]
    )
    return rows[0] ?? null
}
